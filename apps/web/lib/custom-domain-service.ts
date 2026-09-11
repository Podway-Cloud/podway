import "server-only";
import { createAppDb } from "@podway/db";
import { CustomDomainService, FlyCertIssuer, noCertIssuer } from "@podway/control-plane";

/**
 * Builds the CustomDomainService the same way for every caller (the server actions AND the Cloudflare
 * OAuth callback) so they agree on edge config + cert issuer. Certificates come from Fly (it already
 * issues one per hostname on the gateway app); without a token the no-op issuer means a misconfigured
 * deploy can never falsely report a domain as live.
 */
export function customDomainService(): CustomDomainService {
  const token = process.env.FLY_API_TOKEN;
  const app = process.env.PODWAY_DOMAIN_EDGE_APP ?? "podway-gateway";
  return new CustomDomainService(
    createAppDb(),
    {
      cnameTarget: process.env.PODWAY_DOMAIN_CNAME_TARGET ?? "",
      anycastIp: process.env.PODWAY_DOMAIN_ANYCAST_IP ?? "",
    },
    undefined,
    token ? new FlyCertIssuer(app, token) : noCertIssuer,
  );
}
