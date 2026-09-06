/**
 * Fetch a fresh cross-domain gateway bridge token (domain split — the app on podway.io, the gateway
 * on podway.cloud, no shared cookie). Same-origin call to /api/gateway-token, which mints it from the
 * current session. Returns null on any failure so the caller can fall back to a token-less connect
 * (the shared cookie still works during the transition). Client-safe (browser fetch only).
 */
export async function fetchGatewayToken(
  podId: string,
  purpose: "terminal" | "preview",
): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/gateway-token?pod=${encodeURIComponent(podId)}&purpose=${purpose}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: unknown };
    return typeof body.token === "string" ? body.token : null;
  } catch {
    return null;
  }
}

/** A `tokenProvider` for TerminalClient — but only when the gateway is a distinct cross-origin host
 * (cloud). For "auto"/same-origin/self-host the session cookie authenticates the upgrade directly, so
 * no token is needed (returns undefined → TerminalClient stays cookie-based). */
export function terminalTokenProvider(
  gatewayUrl: string,
  podId: string,
): (() => Promise<string | null>) | undefined {
  if (!gatewayUrl || gatewayUrl === "auto") return undefined;
  return () => fetchGatewayToken(podId, "terminal");
}
