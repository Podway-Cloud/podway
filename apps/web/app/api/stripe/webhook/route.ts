import { NextResponse, type NextRequest } from "next/server";
import { getBillingService } from "@/lib/pod-service";
import { stripeConfigured } from "@podway/control-plane";

// The Stripe SDK needs Node (crypto), not the edge runtime; and we must read the RAW body for
// signature verification, so this handler never parses it as JSON.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook receiver. Verifies the signature (a forged/altered body is rejected before any state
 * change), then applies the event. 2xx tells Stripe it's handled; a 5xx makes Stripe retry.
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text();
  const billing = getBillingService();

  let event;
  try {
    event = billing.verifyEvent(raw, signature);
  } catch {
    // Bad or forged signature — never trust the body.
    return NextResponse.json({ error: "signature verification failed" }, { status: 400 });
  }

  try {
    const result = await billing.handleEvent(event);
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    console.error("[stripe webhook] handler error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }
}
