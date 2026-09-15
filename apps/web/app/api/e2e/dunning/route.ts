import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getBillingService, getPodService } from "@/lib/pod-service";
import { DunningService } from "@podway/control-plane";
import { createAppDb, billingAccounts, billingDelinquencies, eq } from "@podway/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * E2E ONLY — drive the non-payment safety net for the SIGNED-IN user. The real detector is a daily
 * gateway sweep on a 7-day clock, which a browser test can neither trigger nor fast-forward, so this
 * runs the owner-scoped `advance` with an injectable clock (`offsetDays` moves "now" forward to cross
 * the grace boundary) and can set the account's mirrored credit (`setCreditCents`) to test resolve —
 * all without any real Stripe call (the no-card path never touches Stripe). Owner-scoped: it only
 * advances the caller's own account. Hard-gated on PODWAY_TEST_LOGIN → 404 anywhere it isn't set, so
 * it cannot exist in production.
 */
export async function POST(req: Request): Promise<Response> {
  if (process.env.PODWAY_TEST_LOGIN !== "1") return new NextResponse(null, { status: 404 });
  const { offsetDays = 0, setCreditCents } = (await req.json().catch(() => ({}))) as {
    offsetDays?: number;
    setCreditCents?: number;
  };
  const user = await requireUser();
  const db = createAppDb();

  if (typeof setCreditCents === "number") {
    const now = new Date();
    await db
      .insert(billingAccounts)
      .values({ ownerId: user.id, creditCents: setCreditCents, hasCard: false, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: billingAccounts.ownerId,
        set: { creditCents: setCreditCents, updatedAt: now },
      });
  }

  const dunning = new DunningService(db, getBillingService(), getPodService(), {
    now: () => Date.now() + offsetDays * DAY_MS,
  });
  const result = await dunning.advance(user.id);
  const rows = await db.select().from(billingDelinquencies).where(eq(billingDelinquencies.ownerId, user.id));
  return NextResponse.json({ result, delinquency: rows[0] ?? null });
}
