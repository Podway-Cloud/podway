import { NextResponse, type NextRequest } from "next/server";
import { mintBridgeToken, type BridgePurpose } from "@podway/auth";
import { getCurrentUser } from "@/lib/session";

/**
 * Cross-domain gateway auth bridge (domain split — docs/plans/domain-split-podway-io.md).
 *
 * The app is on podway.io; the gateway + previews are on podway.cloud and no longer share the login
 * cookie. This route runs on podway.io WITH the owner's session, and mints a short-lived HMAC token
 * (signed with BETTER_AUTH_SECRET, which the gateway also holds) that the terminal/preview client
 * appends as `?t=` when it dials the gateway. The gateway verifies + scope-checks it, then still runs
 * its own pod-ownership check — so minting for a pod you don't own yields a token the gateway rejects.
 *
 * Fetched fresh on every (re)connect, so tokens stay short-lived. `no-store` so it's never cached.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const podId = req.nextUrl.searchParams.get("pod");
  if (!podId) return NextResponse.json({ error: "missing pod" }, { status: 400 });
  const purpose: BridgePurpose =
    req.nextUrl.searchParams.get("purpose") === "preview" ? "preview" : "terminal";

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 500 });

  const token = mintBridgeToken({ userId: user.id, podId, purpose, now: Date.now(), secret });
  return NextResponse.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
