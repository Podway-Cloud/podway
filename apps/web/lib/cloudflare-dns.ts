import "server-only";

/**
 * Cloudflare DNS write — turns an access token from the OAuth exchange into the two records a custom
 * domain needs, written into the owner's zone. Idempotent: an existing record of the same name+type is
 * updated in place (never duplicated), and a CNAME the owner flipped to proxied is corrected back to
 * DNS only. We touch ONLY the two podway records; nothing else in the zone is read for modification.
 *
 * The token is passed in, used here, and dropped by the caller — it is never logged and never returned
 * in an error. Errors are mapped to typed reasons so the wizard can explain what happened.
 */

const API = "https://api.cloudflare.com/client/v4";

export type CloudflareWriteReason = "not_on_cloudflare" | "scope" | "api_error";

export type CloudflareWriteResult =
  | { ok: true; zone: string; written: number }
  | { ok: false; reason: CloudflareWriteReason; message: string };

/** A record to upsert. `content` is the record value; `proxied` applies only to A/CNAME (DNS only). */
export interface RecordInput {
  type: string; // "CNAME" | "A" | "TXT"
  name: string; // full record name, e.g. "app.acme.com" or "_podway-challenge.app.acme.com"
  value: string;
}

interface CfEnvelope<T> {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
}

async function cf<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: CfEnvelope<T> }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({ success: false }))) as CfEnvelope<T>;
  return { status: res.status, body };
}

/** Suffix candidates of a hostname, longest first up to 4 labels — covers `co.uk`-style zones without a
 * public-suffix list: we try `a.b.example.co.uk` → `example.co.uk` → `co.uk`, first that resolves wins. */
function zoneCandidates(hostname: string): string[] {
  const labels = hostname.split(".").filter(Boolean);
  const out: string[] = [];
  for (let take = 2; take <= Math.min(labels.length, 4); take++) {
    out.push(labels.slice(-take).join("."));
  }
  return out;
}

/** Find the Cloudflare zone that owns `hostname` on the authorized account. Returns null if none match
 * (the domain isn't on this Cloudflare account) — the caller turns that into a clean fallback. */
async function resolveZone(
  token: string,
  hostname: string,
): Promise<{ id: string; name: string } | null | { scopeError: string }> {
  for (const name of zoneCandidates(hostname)) {
    const { status, body } = await cf<Array<{ id: string; name: string }>>(
      token,
      `/zones?name=${encodeURIComponent(name)}`,
    );
    // A 403 with an authentication/permission error means the token lacks zone.read — a scope problem,
    // not "domain not found". Surface it distinctly so the owner gets the right message.
    if (status === 403) return { scopeError: body.errors?.[0]?.message || "insufficient scope" };
    const hit = body.result?.[0];
    if (hit) return { id: hit.id, name: hit.name };
  }
  return null;
}

async function upsert(
  token: string,
  zoneId: string,
  rec: { type: string; name: string; content: string; proxied?: boolean },
): Promise<void> {
  const q = `/zones/${zoneId}/dns_records?type=${encodeURIComponent(rec.type)}&name=${encodeURIComponent(rec.name)}`;
  const { body: list } = await cf<Array<{ id: string }>>(token, q);
  const body = JSON.stringify({
    type: rec.type,
    name: rec.name,
    content: rec.content,
    ttl: 1,
    ...(rec.proxied === undefined ? {} : { proxied: rec.proxied }),
  });
  const existing = list.result?.[0];
  const res = existing
    ? await cf(token, `/zones/${zoneId}/dns_records/${existing.id}`, { method: "PUT", body })
    : await cf(token, `/zones/${zoneId}/dns_records`, { method: "POST", body });
  if (!res.body.success) {
    const e = res.body.errors?.[0];
    throw new Error(e?.message || `Cloudflare rejected the ${rec.type} record (${res.status})`);
  }
}

/**
 * Write the custom domain's records into Cloudflare. `hostname` is the domain (its zone is resolved
 * from it); `records` are the exact records the wizard shows. A CNAME/A record is written DNS-only
 * (`proxied:false`) — a proxied CNAME breaks HTTPS issuance.
 */
export async function writeCustomDomainRecords(
  token: string,
  hostname: string,
  records: RecordInput[],
): Promise<CloudflareWriteResult> {
  try {
    const zone = await resolveZone(token, hostname);
    if (zone && "scopeError" in zone) {
      return { ok: false, reason: "scope", message: "Podway wasn't granted permission to read your zones." };
    }
    if (!zone) {
      return {
        ok: false,
        reason: "not_on_cloudflare",
        message: `${hostname} isn't a zone on the Cloudflare account you picked.`,
      };
    }
    let written = 0;
    for (const r of records) {
      const proxied = r.type === "CNAME" || r.type === "A" ? false : undefined;
      await upsert(token, zone.id, { type: r.type, name: r.name, content: r.value, proxied });
      written++;
    }
    return { ok: true, zone: zone.name, written };
  } catch (e) {
    return { ok: false, reason: "api_error", message: e instanceof Error ? e.message : "Cloudflare API error" };
  }
}
