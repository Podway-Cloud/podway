/**
 * Is the custom-domain TLS EDGE actually provisioned?
 *
 * The app layer for custom domains is complete, but a domain cannot work until an owner has
 * allocated the dedicated anycast IPv4 and created the CNAME host that customers point their DNS
 * at (docs/runbooks/custom-domains-edge.md). Without those, showing the feature invites an owner
 * to hand out DNS records that can never verify and to wait on a certificate that will never be
 * issued — worse than the feature simply not being there yet.
 *
 * Both values must be SET. There is deliberately NO default: a default (`cname.podway.cloud`) is
 * exactly what made an unprovisioned placeholder look like a working target.
 *
 * This lives outside `custom-domain-actions.ts` because that file is `"use server"`, which may
 * only export async functions — a sync export there is a build error.
 */
export function customDomainsProvisioned(): boolean {
  return Boolean(process.env.PODWAY_DOMAIN_CNAME_TARGET && process.env.PODWAY_DOMAIN_ANYCAST_IP);
}
