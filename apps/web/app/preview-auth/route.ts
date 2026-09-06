import { NextResponse, type NextRequest } from "next/server";
import { mintBridgeToken, BRIDGE_TOKEN_PARAM } from "@podway/auth/bridge-token";
import { canonicalOrigin } from "@/lib/canonical-origin";
import { getCurrentUser } from "@/lib/session";

/**
 * Cross-domain preview auth entry (domain split — docs/plans/domain-split-podway-io.md).
 *
 * The gateway sends a signed-out browser here (on podway.io) when it hits an owner-only preview on
 * `<slug>.podway.cloud`. This route runs WITH the session: if signed in, it mints a preview bridge
 * token for that pod and redirects to `https://<slug>.<previewBase>/<r>?t=<token>`, where the gateway
 * handshake sets the host-only cookie and lands on `r`. If signed out, it bounces through sign-in and
 * comes back. `r` is a path on the preview host, so it can't be an open redirect (host is fixed).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const slug = req.nextUrl.searchParams.get("slug");
  const r = req.nextUrl.searchParams.get("r") || "/";
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) {
    const self = `/preview-auth?slug=${encodeURIComponent(slug)}&r=${encodeURIComponent(r)}`;
    // NOT req.nextUrl.origin: behind Fly's proxy that is the internal bind address, so a signed-out
    // visitor was sent to https://0.0.0.0:3000/signin — a dead page. In the cockpit's preview iframe
    // that is exactly what the owner saw as "the preview shows a broken page" (2026-09-06).
    const origin = canonicalOrigin(req.headers);
    if (!origin) return NextResponse.json({ error: "could not determine app origin" }, { status: 500 });
    return NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent(self)}`, origin));
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  const base = process.env.PODWAY_PREVIEW_BASE?.replace(/^\.+|\.+$/g, "");
  if (!secret || !base) return NextResponse.json({ error: "not configured" }, { status: 500 });

  const token = mintBridgeToken({
    userId: user.id,
    podId: slug,
    purpose: "preview",
    now: Date.now(),
    ttlMs: 60 * 60_000, // 1h preview session — the gateway cookie carries it
    secret,
  });
  const path = r.startsWith("/") ? r : "/"; // keep it a path on the preview host (no open redirect)
  const sep = path.includes("?") ? "&" : "?";
  const dest = `https://${slug}.${base}${path}${sep}${BRIDGE_TOKEN_PARAM}=${encodeURIComponent(token)}`;
  return NextResponse.redirect(dest);
}
