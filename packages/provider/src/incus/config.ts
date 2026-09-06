import { ProviderError } from "../types.js";
import type { IncusConfig } from "./provider.js";
import type { IncusClientOptions } from "./http-client.js";

/**
 * Env-driven Incus wiring (infra-strategy.md M1). The provider is only
 * constructed when PODWAY_INCUS_URL is set — Fly-only deployments never touch
 * this. Cert/key are PEM contents (Fly secrets carry multiline values fine).
 */

export function isIncusConfigured(env = process.env): boolean {
  return Boolean(env.PODWAY_INCUS_URL);
}

export function loadIncusClientOptions(env = process.env): IncusClientOptions {
  const baseUrl = env.PODWAY_INCUS_URL;
  const clientCertPem = env.PODWAY_INCUS_CLIENT_CERT;
  const clientKeyPem = env.PODWAY_INCUS_CLIENT_KEY;
  if (!baseUrl || !clientCertPem || !clientKeyPem) {
    throw new ProviderError(
      "PODWAY_INCUS_URL, PODWAY_INCUS_CLIENT_CERT and PODWAY_INCUS_CLIENT_KEY are all required",
      "invalid",
    );
  }
  return { baseUrl, clientCertPem, clientKeyPem, project: env.PODWAY_INCUS_PROJECT ?? "default" };
}

export function loadIncusConfig(env = process.env): IncusConfig {
  return {
    // The POOL is genuinely still named `podbay` on the box and always will be — Incus has no
    // `storage rename`, and recreating it means moving every pod's home volume. Not a leftover.
    pool: env.PODWAY_INCUS_POOL ?? "podbay",
    imageAlias: env.PODWAY_INCUS_IMAGE_ALIAS ?? "pod-base",
    // Fingerprint printed by scripts/incus/build-image.sh at publish time.
    imageDigest: env.PODWAY_INCUS_IMAGE_DIGEST ?? "",
    region: env.PODWAY_INCUS_REGION ?? "hetzner-eu",
    agentPort: Number(env.PODWAY_INCUS_AGENT_PORT ?? 8080),
    cpus: Number(env.PODWAY_INCUS_POD_CPUS ?? 2),
    memoryGb: Number(env.PODWAY_INCUS_POD_MEMORY_GB ?? 4),
    homeVolumeGb: Number(env.PODWAY_INCUS_POD_HOME_GB ?? 10),
  };
}
