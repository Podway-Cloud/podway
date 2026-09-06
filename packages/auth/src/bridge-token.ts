import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cross-domain access bridge (2026-09 domain split).
 *
 * The app lives on `podway.io`; the gateway + pod previews live on `podway.cloud`. They no longer
 * share a session cookie (that was the whole point — a pod preview must not sit on the app's login
 * domain). So the gateway can't read the app's login cookie to identify the owner for a terminal
 * socket or a private preview.
 *
 * This is the replacement: the app (which HAS the owner's session) mints a short-lived, HMAC-signed
 * token scoped to ONE pod and ONE purpose; the gateway verifies it with the SAME `BETTER_AUTH_SECRET`
 * both processes already hold — no shared cookie, no DB round-trip, tamper-proof. Format is
 * `<payload b64url>.<hmac-sha256 b64url>`; any edit to the payload fails the constant-time signature
 * check. TTL is deliberately short (the token authorizes the initial upgrade/handshake, not the whole
 * session).
 */
export type BridgePurpose = "terminal" | "preview";

/** Host-only cookie the gateway's preview handshake sets on `<slug>.<previewBase>` to carry the
 * signed preview-session token. Host-only (no Domain attribute) so it never leaks to the parent
 * domain — PSL-safe, and the whole reason the app cookie isn't reused here. */
export const PREVIEW_SESSION_COOKIE = "pw_preview";

/** Query-param that carries a bridge token on the terminal WS URL and the preview handshake redirect.
 * Deliberately namespaced (not a bare `t`) so it never collides with a query param of the arbitrary
 * app a preview proxies. */
export const BRIDGE_TOKEN_PARAM = "__pw_t";

interface BridgePayload {
  u: string; // userId (the owner)
  pod: string; // pod id this token is valid for
  p: BridgePurpose; // what it authorizes
  exp: number; // epoch ms expiry
}

const DEFAULT_TTL_MS = 120_000; // 2 min: covers connect + a retry, not the live session

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

/** Mint a bridge token for the signed-in owner. `secret` is BETTER_AUTH_SECRET (present in web AND
 * gateway). Pod- and purpose-scoped so a leaked terminal token can't open a different pod or a
 * preview, and vice-versa. */
export function mintBridgeToken(args: {
  userId: string;
  podId: string;
  purpose: BridgePurpose;
  now: number;
  ttlMs?: number;
  secret: string;
}): string {
  const { userId, podId, purpose, now, ttlMs = DEFAULT_TTL_MS, secret } = args;
  if (!secret) throw new Error("mintBridgeToken: secret (BETTER_AUTH_SECRET) is required");
  const payload: BridgePayload = { u: userId, pod: podId, p: purpose, exp: now + ttlMs };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/** Verify + decode a bridge token. Returns the identity, or null on tamper, malformed, wrong key, or
 * expiry. Constant-time signature comparison. Callers MUST still check `podId`/`purpose` match the
 * resource being accessed. */
export function verifyBridgeToken(
  token: string,
  args: { now: number; secret: string },
): { userId: string; podId: string; purpose: BridgePurpose } | null {
  const { now, secret } = args;
  if (!secret) return null;
  try {
    const dot = token.indexOf(".");
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = sign(body, secret);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as BridgePayload;
    if (
      typeof p.u !== "string" ||
      typeof p.pod !== "string" ||
      (p.p !== "terminal" && p.p !== "preview") ||
      typeof p.exp !== "number"
    ) {
      return null;
    }
    if (now > p.exp) return null;
    return { userId: p.u, podId: p.pod, purpose: p.p };
  } catch {
    return null; // tampered / wrong key / malformed
  }
}
