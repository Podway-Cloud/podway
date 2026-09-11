"use server";

import { type CustomDomainRecord, type DnsRecord } from "@podway/control-plane";
import { requireApprovedUser } from "@/lib/access";
import { editionOss } from "@/lib/session";
import { getPodService } from "@/lib/pod-service";
import { customDomainsProvisioned } from "@/lib/custom-domain-config";
import { customDomainService } from "@/lib/custom-domain-service";

/**
 * Server actions for custom domains (add-custom-domains). Cloud-only — every action gates on
 * !editionOss() and verifies the pod belongs to the caller before touching a domain. The edge
 * targets (the CNAME host + anycast IP the wizard tells owners to point at) come from env; they're
 * provisioned as infra (design.md) and default to sensible placeholders until that edge exists.
 */
const service = customDomainService;

async function assertOwnedPod(slug: string): Promise<string> {
  const user = await requireApprovedUser();
  if (editionOss()) throw new Error("Custom domains are a cloud feature.");
  // Hiding the row is presentation; this is the actual gate. A hand-crafted request must not be
  // able to create a domain that no edge can ever serve.
  if (!customDomainsProvisioned()) throw new Error("Custom domains aren't available yet.");
  // Throws not_found unless this user owns the pod — the authz gate for every domain action.
  await getPodService().getPod(user.id, slug);
  return user.id;
}

export type CustomDomainView = CustomDomainRecord & { records: DnsRecord[] };

/** The pod's domains + the DNS records to show for each (for the Settings row + the wizard). */
export async function listCustomDomains(slug: string): Promise<CustomDomainView[]> {
  await assertOwnedPod(slug);
  const svc = service();
  const domains = await svc.listForPod(slug);
  return domains.map((d) => ({ ...d, records: svc.dnsRecordsFor(d) }));
}

export async function addCustomDomain(
  slug: string,
  hostname: string,
): Promise<{ ok: true; domain: CustomDomainView } | { ok: false; error: string }> {
  const ownerId = await assertOwnedPod(slug);
  const svc = service();
  const r = await svc.add(ownerId, slug, hostname);
  if (!r.ok) return r;
  return { ok: true, domain: { ...r.domain, records: svc.dnsRecordsFor(r.domain) } };
}

export async function removeCustomDomain(slug: string, id: string): Promise<{ ok: true }> {
  const ownerId = await assertOwnedPod(slug);
  await service().remove(ownerId, id);
  return { ok: true };
}

/** Re-check a domain's DNS now (owner "re-check" + the wizard's auto-poll). Returns the updated view. */
export async function recheckCustomDomain(slug: string, id: string): Promise<CustomDomainView | null> {
  await assertOwnedPod(slug);
  const svc = service();
  // Two steps, because they answer different questions: verify() asks "is their DNS right yet?",
  // refreshCert() asks "has the edge actually issued HTTPS?". A domain is only `active` once the
  // second is true — correct DNS alone is not a working site.
  const verified = await svc.verify(id);
  const domain = (await svc.refreshCert(id)) ?? verified;
  return domain ? { ...domain, records: svc.dnsRecordsFor(domain) } : null;
}
