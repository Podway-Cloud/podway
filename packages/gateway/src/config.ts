import type { IncomingMessage } from "node:http";
import type { PodService } from "@podway/control-plane";
import type { Logger } from "@podway/shared/log";

/** What an authenticated request is FOR — lets `authenticate` scope-check a cross-domain bridge
 * token (see the domain split, `docs/plans/domain-split-podway-io.md`). */
export interface AuthExpect {
  podId?: string;
  purpose?: "terminal" | "preview";
}

/**
 * The relay's control-plane surface, as the gateway needs it. Structural, so the real
 * `RelayService` (from @podway/control-plane) satisfies it and a fake stands in for
 * tests. Everything the gateway does to relay auth/state goes through here.
 */
export interface RelayAuthority {
  /** Spend a pairing code, returning the owner it belongs to, or null if unknown,
   * expired, or already used. Single-use is enforced here. */
  redeemPairingCode(code: string): Promise<string | null>;
  /** Mint a fresh pairing code for an owner (used when a pod asks its owner to bring
   * up a relay). */
  mintPairingCode(ownerId: string): Promise<{ code: string; expiresAt: number }>;
  /** Issue a durable, reusable reconnect token at pairing, handed to the relay so it
   * can reconnect after a restart/blip without re-pairing. */
  issueReconnectToken(ownerId: string): Promise<string>;
  /** Validate a reusable reconnect token (does NOT consume it), returning the owner or
   * null if unknown/expired. */
  validateReconnectToken(token: string): Promise<string | null>;
  /** Record (or refresh) that an owner's relay is connected. */
  markConnected(ownerId: string, loginDomains: string[]): Promise<void>;
  /** Keep-alive while the socket is up. */
  heartbeat(ownerId: string): Promise<void>;
  /** The socket closed and we know it. */
  markDisconnected(ownerId: string): Promise<void>;
  /** Reap connection rows disconnected longer than `olderThanMs`; returns how many were removed. */
  reapStaleConnections(olderThanMs: number): Promise<number>;
}

export interface GatewayConfig {
  /** Structured logger; defaults to a JSON-line logger on stdout. */
  logger?: Logger;
  /** The control plane (ownership, lifecycle, idle policy). */
  control: PodService;
  /** Fetch-memory sink for the pod control sockets. Optional: absent → the control
   * hub is not created and the gateway behaves exactly as before. */
  fetchMemory?: import("./pod-control-hub.js").FetchMemorySink;
  /** Relay registry. Absent → the /relay endpoint 404s and nothing else changes. */
  relays?: import("./relay-registry.js").RelayRegistry;
  /** Public wss:// base a relay dials to reach this gateway, e.g.
   * "wss://gateway.podway.cloud". Used to build the copy-paste command a pod hands its
   * owner. Absent → the pod-pairing convenience is off (the dashboard still works). */
  relayConnectUrl?: string;
  /** Authority that validates relay pairing codes and records connection state,
   * backed by the shared database (RelayService satisfies this). Absent → a relay
   * cannot authenticate, so /relay closes every connection. Injected as an interface,
   * not a concrete service, so the socket path stays testable without a database. */
  relayAuthority?: RelayAuthority;
  /** Authenticate an upgrade/preview request to a user id, or null if unauthenticated. The optional
   * `expect` lets a caller supply the pod + purpose the request is FOR, so a cross-domain bridge
   * token (post podway.io split) can be scope-checked — a token minted for pod A / "terminal" is
   * rejected for pod B or a preview. The legacy shared cookie ignores `expect` (it only proves the
   * user is signed in; the caller's own ownership check scopes it, as before). */
  authenticate: (req: IncomingMessage, expect?: AuthExpect) => Promise<string | null>;
  /** Resolve a running pod's pod-agent WebSocket URL. */
  resolveAgentUrl: (podId: string) => Promise<string>;
  /**
   * Preview URL base host (e.g. "preview.podway.cloud"). When set, the gateway
   * also serves `<slug>.<previewBase>` by proxying to the pod's app port. Unset
   * (local/dev) → previews disabled, terminal-only.
   */
  previewBase?: string;
  /**
   * Resolve a CUSTOM hostname (an owner's own domain, e.g. `app.acme.com`) to the pod slug it is
   * attached to, or null. Only `active` domains resolve — a domain whose certificate has not been
   * issued must not serve, or a visitor gets a TLS error instead of a page.
   *
   * A narrow port rather than widening `control`, so self-host (which has no custom domains) simply
   * leaves it unset and every custom-hostname request falls through to the normal 404. Consulted
   * ONLY for a host we do not otherwise recognise, so it costs nothing on the hot paths.
   */
  resolveCustomHost?: (hostname: string) => Promise<string | null>;
  /** Pod app port the preview proxies to (default 3000). */
  previewPort?: number;
  /** The main app origin (e.g. "https://podway.cloud"). When set, an
   * unauthenticated BROWSER hitting a private preview is redirected here to sign
   * in (the session cookie is domain-shared, so the retry then works) instead of
   * a bare 401. */
  appOrigin?: string;
  /** Resolve a running pod's preview origin, e.g. `http://[ip]:3000`. */
  resolvePreviewOrigin?: (podId: string) => Promise<string>;
  host?: string;
  port?: number;
  /** Idle threshold handed to the control-plane idle policy. */
  /** Pods to re-check per sweep. Bounded so a large fleet rotates instead of
   * hammering the provider once a minute. */
  reconcilePerSweep?: number;
  /** How often the idle sweep runs. */
  tickMs?: number;
  /** How often the provisioner sweep runs (builds "provisioning" pods). Fast so
   * launches feel immediate. 0 disables the worker in this instance. */
  provisionIntervalMs?: number;
  /** Max time to wait for a woken pod to reach running. */
  wakeTimeoutMs?: number;
  /** Maintenance-wake dormancy threshold (ms). 0/undefined = disabled (opt-in). */
  maintenanceDormantMs?: number;
  /** Max pods to maintenance-wake per sweep (bounds cost). */
  maintenanceMaxPerSweep?: number;
  /** Running-but-idle token-refresh threshold (ms): a RUNNING pod whose agent has been idle beyond
   * this gets one trivial headless call so its rotating login refreshes before hard expiry (the
   * afisha class — the fleet never idle-sleeps, so nothing else renews it). undefined = default 7d;
   * 0 disables. */
  maintenanceRefreshIdleMs?: number;
}
