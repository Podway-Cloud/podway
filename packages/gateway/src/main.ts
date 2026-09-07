import path from "node:path";
import type { IncomingMessage } from "node:http";
import { createAuth, getSessionUserId, notifyOps, type AuthEnv } from "@podway/auth";
import { verifyBridgeToken, PREVIEW_SESSION_COOKIE, BRIDGE_TOKEN_PARAM } from "@podway/auth/bridge-token";
import { PodService, DrizzlePodStore, FetchMemory, AgentMessages, RelayService, SecretVault, DrizzleSecretStore, CustomDomainService, FlyCertIssuer } from "@podway/control-plane";
import { RelayRegistry } from "./relay-registry.js";
import {
  IncusProvider,
  IncusApi,
  isIncusConfigured,
  loadIncusClientOptions,
  loadIncusConfig,
  type SandboxProvider,
} from "@podway/provider";
import { createAppDb } from "@podway/db";
import { credKeyFromEnv } from "@podway/shared/crypto";
import { GatewayServer } from "./server.js";

/** Production wiring: real better-auth sessions, Fly (+ optional Incus)
 * providers, Neon-backed pods. Incus joins only when PODWAY_INCUS_URL is set
 * (infra-strategy.md M1); PODWAY_DEFAULT_PROVIDER flips where NEW pods land. */
async function main(): Promise<void> {
  const auth = createAuth(process.env as AuthEnv);

  // Incus is the only provider in cloud. The Fly provider was deleted on 2026-09-04: its app and
  // registry no longer exist and no pod has ever been provider=fly since the Incus pivot.
  const providers: Record<string, SandboxProvider> = {};
  if (process.env.PODWAY_INCUS_URL) {
    providers.incus = new IncusProvider(new IncusApi(loadIncusClientOptions()), loadIncusConfig());
  }
  const defaultProviderName = process.env.PODWAY_DEFAULT_PROVIDER ?? "incus";
  const provider = providers[defaultProviderName];
  if (!provider) throw new Error(`no provider "${defaultProviderName}" — set PODWAY_INCUS_URL`);
  // createAppDb (not createNeonDb) so PODWAY_DB selects the driver — the web app
  // already did this, and the mismatch broke prod when the DB moved off Neon
  // 2026-07-27: the gateway kept using the neon-http driver against a plain
  // Postgres URL, so EVERY query failed ("NeonDbError: fetch failed") — terminal
  // WS rejected with 500 and the reconcile sweep died, while web looked fine.
  const db = createAppDb();
  // Routing lookups AND the background poller live here. The poller must be able to ask Fly about
  // certs, so unlike a pure routing lookup it gets a real issuer — falling back to the no-op without
  // FLY_API_TOKEN so a misconfigured deploy still cannot report a domain live.
  const customDomains = new CustomDomainService(
    db,
    {
      cnameTarget: process.env.PODWAY_DOMAIN_CNAME_TARGET ?? "",
      anycastIp: process.env.PODWAY_DOMAIN_ANYCAST_IP ?? "",
    },
    undefined,
    process.env.FLY_API_TOKEN
      ? new FlyCertIssuer(process.env.PODWAY_DOMAIN_EDGE_APP ?? "podway-gateway", process.env.FLY_API_TOKEN)
      : undefined,
  );
  const fetchMemory = new FetchMemory(db);
  const agentMessages = new AgentMessages(db);
  const relays = new RelayRegistry();
  const relayService = new RelayService(db);
  const control = new PodService(provider, new DrizzlePodStore(db), {
    environmentsRoot: process.env.PODWAY_ENVIRONMENTS_ROOT ?? path.resolve("environments"),
    providers,
    defaultProviderName,
    // The HTTP exchange floor also runs from the gateway's reconcile, so a pod on an
    // older image (no control socket) still syncs.
    fetchMemory,
    // The per-pod secret vault. The gateway needs it because the RECONCILE SWEEP lives here, and
    // the sweep is what notices a pod whose /etc/podway/secrets.env was destroyed by a recreate and
    // puts it back. Without this the self-heal returned instantly and silently on every sweep, and
    // the ops pod sat with no secrets even after the fix shipped (observed 2026-09-07 — the fix was
    // deployed and correct, and simply never had a vault to restore FROM).
    secretVault: process.env.PODWAY_CRED_KEY
      ? new SecretVault(new DrizzleSecretStore(db), credKeyFromEnv())
      : undefined,
    // Owner-scoped pod↔pod messaging drains + routes on the same reconcile sweep.
    agentMessages,
    // Critical unplanned incidents (agent OOM, wedged pod, failed provision) page the
    // ops Telegram — deduped per pod+type inside the service. Runs here because the
    // reconcile (which detects them) lives in the gateway.
    onIncident: async (info) => {
      // Show the owner-chosen display name where set (with the slug for support), so the
      // page reads "pod: my-crawler (dual-bear-fb14)" rather than just the slug.
      const name = await control.nameOf(info.podId).catch(() => null);
      const label = name && name !== info.podId ? `${name} (${info.podId})` : info.podId;
      await notifyOps(`⚠️ podway incident\n${info.title}\npod: ${label}`).catch(() => undefined);
    },
  });

  const server = new GatewayServer({
    control,
    // Adapt owner-scoped FetchMemory to the hub's FetchMemorySink (M1): the hub knows
    // only podId, so resolve the owner here for attribution, and broadcast the TRUSTED
    // global baseline (owner "") — a pod's own-owner verdicts ride the reconcile push.
    fetchMemory: {
      record: async (podId, domain, rung, outcome) => {
        const owner = await control.ownerOf(podId).catch(() => null);
        if (owner != null) await fetchMemory.record(owner, domain, rung as never, outcome as never);
      },
      fleetPlan: () => fetchMemory.fleetPlan(""),
    },
    relays,
    relayAuthority: relayService,
    // Public wss:// this gateway is reachable at, for the pod→owner pairing command.
    // Derived from the preview base if unset (gateway.<root>), so a standard deploy
    // needs no extra config; PODWAY_RELAY_CONNECT_URL overrides.
    relayConnectUrl: relayConnectUrl(),
    authenticate: async (req: IncomingMessage, expect) => {
      // Cross-domain bridge (domain split, docs/plans/domain-split-podway-io.md): the app on
      // podway.io mints a short-lived HMAC token; we verify it here with the SAME BETTER_AUTH_SECRET,
      // so a terminal/preview on podway.cloud no longer needs to read the app's login cookie. Two
      // carriers: the terminal WS `?t=`/Bearer, and the host-only `pw_preview` cookie set by the
      // preview handshake. Both are pod- + purpose-scoped, so we check they match this request.
      const now = Date.now();
      const secret = process.env.BETTER_AUTH_SECRET ?? "";
      for (const t of [bridgeTokenFromRequest(req), previewCookieToken(req)]) {
        if (!t) continue;
        const v = verifyBridgeToken(t, { now, secret });
        if (
          v &&
          (!expect?.podId || v.podId === expect.podId) &&
          (!expect?.purpose || v.purpose === expect.purpose)
        ) {
          return v.userId;
        }
        // A present-but-invalid token falls through (transition-safe): a stale token must not lock
        // out a still-valid shared cookie while both auth paths coexist.
      }
      // Legacy shared cookie (pre-split; works only while COOKIE_DOMAIN still spans app+gateway).
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(", "));
      }
      return getSessionUserId(auth, headers);
    },
    // Route by each pod's recorded provider, so a terminal/preview to a pod on
    // ANY backend resolves to the right address (Fly 6PN or Incus-over-WG).
    resolveAgentUrl: async (podId) => {
      const endpoint = await (await control.providerForPod(podId)).endpoint(podId);
      return endpoint.replace(/^http/, "ws");
    },
    // Preview URLs: served on `<slug>.<PODWAY_PREVIEW_BASE>` when configured.
    previewBase: process.env.PODWAY_PREVIEW_BASE || undefined,
    // Custom domains (cloud only). Left UNSET unless the edge is provisioned, so an unconfigured
    // deploy — and self-host, which has no custom domains — never does the lookup at all.
    resolveCustomHost:
      process.env.PODWAY_DOMAIN_CNAME_TARGET && process.env.PODWAY_DOMAIN_ANYCAST_IP
        ? async (hostname: string) => customDomains.activePodFor(hostname)
        : undefined,
    previewPort: Number(process.env.PODWAY_PREVIEW_PORT ?? 3000),
    resolvePreviewOrigin: async (podId) =>
      (await control.providerForPod(podId)).podAddress(
        podId,
        Number(process.env.PODWAY_PREVIEW_PORT ?? 3000),
      ),
    host: process.env.PODWAY_GATEWAY_HOST ?? "::",
    port: Number(process.env.PODWAY_GATEWAY_PORT ?? 8090),
    // Where to send a signed-out browser that hit a private preview. Explicit
    // PODWAY_APP_ORIGIN, else the first trusted origin, else derived from the
    // preview base (preview.podway.cloud → https://podway.cloud).
    appOrigin: appOrigin(),
    // Maintenance wake is opt-in: set PODWAY_MAINTENANCE_DORMANT_DAYS to enable
    // (keeps dormant pods' logins alive; costs a short wake per dormant pod).
    maintenanceDormantMs: process.env.PODWAY_MAINTENANCE_DORMANT_DAYS
      ? Number(process.env.PODWAY_MAINTENANCE_DORMANT_DAYS) * 24 * 60 * 60 * 1000
      : undefined,
  });

  const { host, port } = await server.listen();
  console.log(`podway-gateway listening on ${host}:${port}`);

  // Fleet reconcile sweep: periodically re-sync every pod's DB record with the
  // provider's real state, so the owner + admin dashboards always show the truth
  // without anyone clicking anything — drift (a ghost, a stuck status, a crashed
  // machine) heals on its own within a sweep. Wake-safe: service.reconcile reads
  // instance metadata and only dials the agent for a pod already running, so a
  // suspended pod is never woken. Best-effort + batched so a large fleet can't
  // hammer the provider. Set PODWAY_RECONCILE_SWEEP_MS=0 to disable.
  const sweepMs = Number(process.env.PODWAY_RECONCILE_SWEEP_MS ?? 90_000);
  if (sweepMs > 0) {
    let sweeping = false;
    const sweep = async () => {
      if (sweeping) return; // never overlap a slow sweep with the next tick
      sweeping = true;
      try {
        const pods = await control.listAllPods();
        for (let i = 0; i < pods.length; i += 6) {
          await Promise.all(
            pods.slice(i, i + 6).map((p) => control.reconcile(p.id).catch(() => undefined)),
          );
        }
      } catch (e) {
        console.error("reconcile_sweep_failed", e);
      } finally {
        sweeping = false;
      }
    };
    setInterval(() => void sweep(), sweepMs).unref();
    console.log(`podway-gateway reconcile sweep every ${sweepMs}ms`);
  }

  // Custom-domain poller. Without it a domain only advances while the owner is LOOKING at it (the
  // wizard poll / re-check button), so closing the tab while Let's Encrypt is still issuing (~6 min
  // on the live test) leaves it on "Verifying" forever. Runs only where the edge is configured, and
  // only in the gateway — the process guaranteed up whether or not a dashboard is open.
  const domainPollMs = Number(process.env.PODWAY_DOMAIN_POLL_MS ?? 60_000);
  if (domainPollMs > 0 && process.env.PODWAY_DOMAIN_CNAME_TARGET && process.env.PODWAY_DOMAIN_ANYCAST_IP) {
    let polling = false;
    setInterval(() => {
      if (polling) return;             // skip, never stack a slow sweep behind itself
      polling = true;
      void (async () => {
        try {
          const r = await customDomains.pollPending();
          if (r.nowActive.length) console.log(`custom_domain_active ${r.nowActive.join(",")}`);
        } catch (e) {
          console.error("custom_domain_poll_failed", e);
        } finally {
          polling = false;
        }
      })();
    }, domainPollMs).unref();
    console.log(`podway-gateway custom-domain poll every ${domainPollMs}ms`);
  }

  // Daily WARNINGS digest (§7): criticals page immediately (onIncident above);
  // warnings batch into one ops summary. In-memory cadence — a gateway restart resets
  // the clock (at most one extra/late digest), acceptable for a best-effort summary.
  const digestMs = Number(process.env.PODWAY_WARN_DIGEST_MS ?? 24 * 60 * 60_000);
  if (digestMs > 0) {
    setInterval(() => {
      void (async () => {
        try {
          const text = await control.buildWarnDigest(Date.now() - digestMs);
          if (text) await notifyOps(text);
        } catch (e) {
          console.error("warn_digest_failed", e);
        }
      })();
    }, digestMs).unref();
    console.log(`podway-gateway warn digest every ${digestMs}ms`);
  }

  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => void server.close().finally(() => process.exit(0)));
  }
}

/** The main app origin for the private-preview sign-in redirect. */
/** The public wss:// a relay dials to reach this gateway. Explicit override, else the
 * gateway's own host under the preview root (gateway.podway.cloud), else off. */
function relayConnectUrl(): string | undefined {
  if (process.env.PODWAY_RELAY_CONNECT_URL) return process.env.PODWAY_RELAY_CONNECT_URL;
  const base = process.env.PODWAY_PREVIEW_BASE?.replace(/^\.+|\.+$/g, "");
  // preview.podway.cloud → gateway.podway.cloud
  if (base && base.split(".").length > 2) return `wss://gateway.${base.split(".").slice(1).join(".")}`;
  return base ? `wss://gateway.${base}` : undefined;
}

/** Pull a cross-domain bridge token from an upgrade/preview request: the `t` query param (on the WS
 * or preview handshake URL) or an `Authorization: Bearer <token>` header. Undefined when neither. */
function bridgeTokenFromRequest(req: IncomingMessage): string | undefined {
  const url = req.url ?? "";
  const q = url.indexOf("?");
  if (q >= 0) {
    const t = new URLSearchParams(url.slice(q + 1)).get(BRIDGE_TOKEN_PARAM);
    if (t) return t;
  }
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

/** Read the host-only `pw_preview` session token from the request Cookie header (set by the preview
 * handshake). Returns undefined when absent. */
function previewCookieToken(req: IncomingMessage): string | undefined {
  const raw = req.headers["cookie"];
  if (typeof raw !== "string") return undefined;
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === PREVIEW_SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

function appOrigin(): string | undefined {
  if (process.env.PODWAY_APP_ORIGIN) return process.env.PODWAY_APP_ORIGIN;
  const trusted = process.env.TRUSTED_ORIGINS?.split(",")[0]?.trim();
  if (trusted) return trusted;
  const base = process.env.PODWAY_PREVIEW_BASE?.replace(/^\.+|\.+$/g, "");
  // Strip the leading preview label: preview.podway.cloud → podway.cloud.
  if (base && base.split(".").length > 2) return `https://${base.split(".").slice(1).join(".")}`;
  return base ? `https://${base}` : undefined;
}

main().catch((e) => {
  console.error("gateway failed to start:", e);
  process.exit(1);
});
