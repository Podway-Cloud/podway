import { NextResponse } from "next/server";

/**
 * What gateway URL does this deployment hand to browsers?
 *
 * Exists for the deploy smoke check. On 2026-09-06 the web terminal was dead in production — the app
 * was still handing out `wss://gw.podbay.cloud`, whose TLS stopped working with the rename — and
 * nothing caught it: e2e's global-setup injects its OWN gateway URL, so the terminal passes there by
 * construction regardless of what production is configured with. The only place that class of bug is
 * visible is against the real deployment, and the smoke check needs to READ the value to probe it.
 *
 * Safe to expose: this exact string is already embedded in every terminal page served to any
 * signed-in user, so it reveals nothing new. It is a public hostname, never a credential — and the
 * response is deliberately just the one field, so this can never grow into a config dump.
 */
export const dynamic = "force-dynamic";

export function GET(): Response {
  const gatewayUrl =
    process.env.NEXT_PUBLIC_GATEWAY_URL ??
    (process.env.PODWAY_GATEWAY_SAMEORIGIN === "1" ? "auto" : "");
  return NextResponse.json({ gatewayUrl });
}
