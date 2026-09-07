import { eq, and, type Database } from "@podway/db";
import { customDomains } from "@podway/db";
import { normalizeHostname, recordTypeFor } from "@podway/shared";
import { randomBytes } from "node:crypto";
import { noCertIssuer, type CertIssuer } from "./cert-issuer.js";

/**
 * Custom domains (add-custom-domains) — the control-plane surface: add/list/remove a hostname on a
 * pod, and the DNS records the owner must add. Cloud-only feature; callers gate on !editionOss().
 * The DNS-verify poller + cert issuance live in the gateway/edge (infra-gated); this owns the data +
 * the record instructions the wizard shows.
 */

export type CustomDomainStatus = "pending" | "verifying" | "active" | "error" | "disabled";
export type CustomDomainCertStatus = "none" | "issued" | "renewing" | "failed";

export interface CustomDomainRecord {
  id: string;
  podId: string;
  ownerId: string;
  hostname: string;
  recordType: "cname" | "a";
  status: CustomDomainStatus;
  verifyToken: string;
  verifiedAt: string | null;
  certStatus: CustomDomainCertStatus;
  certNotAfter: string | null;
  error: string | null;
  createdAt: string;
}

/**
 * DNS lookups the verifier needs — injectable so it's testable without touching the network. The
 * default (nodeDnsResolver) uses node:dns/promises.
 */
export interface DnsResolver {
  resolveCname(name: string): Promise<string[]>;
  resolveA(name: string): Promise<string[]>;
  resolveTxt(name: string): Promise<string[]>;
}

/** A DNS record to display in the setup wizard. */
export interface DnsRecord {
  type: "CNAME" | "A" | "TXT";
  /** The host/name to create the record on. */
  name: string;
  /** The value to point it at. */
  value: string;
  /** Owner-facing label ("CNAME", "A · root domain", "TXT · ownership"). */
  label: string;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

function toRecord(row: typeof customDomains.$inferSelect): CustomDomainRecord {
  return {
    id: row.id,
    podId: row.podId,
    ownerId: row.ownerId,
    hostname: row.hostname,
    recordType: row.recordType as "cname" | "a",
    status: row.status as CustomDomainStatus,
    verifyToken: row.verifyToken,
    verifiedAt: iso(row.verifiedAt),
    certStatus: row.certStatus as CustomDomainCertStatus,
    certNotAfter: iso(row.certNotAfter),
    error: row.error,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
  };
}

/** The default resolver — node:dns/promises. Returns [] for a name that doesn't resolve. */
export const nodeDnsResolver: DnsResolver = {
  async resolveCname(name) {
    const dns = await import("node:dns/promises");
    return dns.resolveCname(name).catch(() => []);
  },
  async resolveA(name) {
    const dns = await import("node:dns/promises");
    return dns.resolve4(name).catch(() => []);
  },
  async resolveTxt(name) {
    const dns = await import("node:dns/promises");
    return dns.resolveTxt(name).then((rows) => rows.map((r) => r.join(""))).catch(() => []);
  },
};

export class CustomDomainService {
  constructor(
    private db: Database,
    /** The stable edge targets shown to owners — provisioned as infra (see design.md). */
    private edge: { cnameTarget: string; anycastIp: string },
    private resolver: DnsResolver = nodeDnsResolver,
    /** Issues/revokes the TLS cert. Defaults to a no-op, so an unprovisioned edge never
     *  pretends a domain went live. */
    private certs: CertIssuer = noCertIssuer,
  ) {}

  /** Add a hostname to a pod. Validates + de-dupes; the row starts `pending` until DNS verifies. */
  async add(
    ownerId: string,
    podId: string,
    rawHostname: string,
  ): Promise<{ ok: true; domain: CustomDomainRecord } | { ok: false; error: string }> {
    const hostname = normalizeHostname(rawHostname);
    if (!hostname) {
      return { ok: false, error: "That doesn't look like a domain — try something like app.acme.com." };
    }
    const clash = await this.db.select().from(customDomains).where(eq(customDomains.hostname, hostname));
    if (clash.length > 0) {
      return { ok: false, error: "That domain is already connected to a pod." };
    }
    const id = randomBytes(12).toString("hex");
    // "pw-", not "pb-": this token is published in a CUSTOMER'S DNS zone, so the old podbay
    // initials would have outlived the rename in other people's records.
    const verifyToken = "pw-" + randomBytes(16).toString("hex");
    await this.db.insert(customDomains).values({
      id,
      podId,
      ownerId,
      hostname,
      recordType: recordTypeFor(hostname),
      status: "pending",
      verifyToken,
      certStatus: "none",
    });
    const domain = await this.get(id);
    return domain ? { ok: true, domain } : { ok: false, error: "Could not save the domain — try again." };
  }

  async get(id: string): Promise<CustomDomainRecord | null> {
    const rows = await this.db.select().from(customDomains).where(eq(customDomains.id, id));
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async listForPod(podId: string): Promise<CustomDomainRecord[]> {
    const rows = await this.db.select().from(customDomains).where(eq(customDomains.podId, podId));
    return rows.map(toRecord);
  }

  /** Remove a domain (scoped to its owner). Frees the hostname for reuse. */
  async remove(ownerId: string, id: string): Promise<void> {
    // Revoke BEFORE deleting the row: if revocation throws, the row survives and the next removal
    // can retry. Deleting first would strand a live certificate for a hostname we no longer serve,
    // and nothing would ever clean it up.
    const domain = await this.get(id);
    if (domain && domain.ownerId === ownerId) await this.certs.revoke(domain.hostname).catch(() => undefined);
    await this.db.delete(customDomains).where(and(eq(customDomains.id, id), eq(customDomains.ownerId, ownerId)));
  }

  /**
   * Advance a DNS-verified domain to LIVE once the edge has actually issued its certificate.
   * This is the only path to `active` — a domain is not live because DNS is right, it is live
   * because HTTPS works. Called by the owner's "re-check" and the background poller.
   */
  async refreshCert(id: string): Promise<CustomDomainRecord | null> {
    const domain = await this.get(id);
    if (!domain) return null;
    if (domain.status !== "verifying" && domain.status !== "active") return domain;

    const state = await this.certs.state(domain.hostname).catch(() => null);
    if (state === null) return domain; // edge unreachable: report nothing rather than a wrong thing
    const now = new Date();
    if (state === "issued") {
      await this.db.update(customDomains)
        .set({ status: "active", certStatus: "issued", error: null, lastCheckedAt: now })
        .where(eq(customDomains.id, id));
    } else if (state === "failed") {
      await this.db.update(customDomains)
        .set({ status: "error", certStatus: "failed", error: "We couldn't get a certificate for this domain.", lastCheckedAt: now })
        .where(eq(customDomains.id, id));
    } else {
      // still pending — retry issuance, since an `addCertificate` may have been lost
      await this.certs.issue(domain.hostname).catch(() => undefined);
      await this.db.update(customDomains).set({ lastCheckedAt: now }).where(eq(customDomains.id, id));
    }
    return this.get(id);
  }

  /**
   * Check a domain's DNS: does the CNAME/A point at us AND the TXT ownership challenge resolve? On
   * success it advances to `verifying` (DNS confirmed — the edge then issues the cert + flips it to
   * `active`); on failure it records a plain `error`. Never regresses an already-`active` domain (the
   * edge owns that transition). Runs on the owner's "re-check" and on the background poller.
   */
  async verify(id: string): Promise<CustomDomainRecord | null> {
    const domain = await this.get(id);
    if (!domain) return null;
    if (domain.status === "active") return domain; // the edge owns "active"

    const txt = await this.resolver.resolveTxt(`_podway-challenge.${domain.hostname}`);
    const txtOk = txt.includes(domain.verifyToken);
    let pointerOk: boolean;
    if (domain.recordType === "a") {
      pointerOk = (await this.resolver.resolveA(domain.hostname)).includes(this.edge.anycastIp);
    } else {
      const target = this.edge.cnameTarget.replace(/\.$/, "").toLowerCase();
      pointerOk = (await this.resolver.resolveCname(domain.hostname)).some(
        (c) => c.replace(/\.$/, "").toLowerCase() === target,
      );
    }

    const now = new Date();
    if (txtOk && pointerOk) {
      // DNS is right, so ask the edge for the certificate NOW. Idempotent, and deliberately
      // best-effort: a transient API failure must not flip a correctly-configured domain to
      // `error` in front of its owner — the next poll retries.
      await this.certs.issue(domain.hostname).catch(() => undefined);
    }
    const patch = txtOk && pointerOk
      ? { status: "verifying", verifiedAt: now, error: null, lastCheckedAt: now }
      : {
          status: "error",
          error: !pointerOk
            ? domain.recordType === "a"
              ? "Your A record isn't pointing to us yet."
              : "Your CNAME isn't pointing to us yet."
            : "The ownership TXT record isn't visible yet.",
          lastCheckedAt: now,
        };
    await this.db.update(customDomains).set(patch).where(eq(customDomains.id, id));
    return this.get(id);
  }

  /**
   * UNSCOPED routing lookup: which pod does this hostname serve? Used by the gateway on an
   * inbound request, so the caller is anonymous by construction.
   *
   * Only an **active** domain resolves. A `verifying` one must not serve: its certificate is not
   * issued yet, so a visitor would get a TLS error rather than a page — and a `disabled` or
   * `error` one has been switched off or never worked. Returns the pod id (which is its slug).
   */
  async activePodFor(rawHostname: string): Promise<string | null> {
    const hostname = normalizeHostname(rawHostname);
    if (!hostname) return null;
    const rows = await this.db
      .select()
      .from(customDomains)
      .where(and(eq(customDomains.hostname, hostname), eq(customDomains.status, "active")));
    return rows[0]?.podId ?? null;
  }

  /** The exact DNS records to show for a domain: a CNAME (or A record for apex) + the TXT challenge. */
  dnsRecordsFor(domain: CustomDomainRecord): DnsRecord[] {
    const recs: DnsRecord[] =
      domain.recordType === "a"
        ? [{ type: "A", name: domain.hostname, value: this.edge.anycastIp, label: "A · root domain" }]
        : [{ type: "CNAME", name: domain.hostname, value: this.edge.cnameTarget, label: "CNAME" }];
    recs.push({
      type: "TXT",
      name: `_podway-challenge.${domain.hostname}`,
      value: domain.verifyToken,
      label: "TXT · ownership",
    });
    return recs;
  }
}
