import "server-only";
import { NextResponse } from "next/server";
import { getPodService } from "@/lib/pod-service";

/**
 * What the dashboard card sweep actually COSTS in production.
 *
 * The 2026-09-07 stall fix (single-flight, worker pool, 3s probe budget, skip mid-update pods, a
 * per-pod breaker) was measured only on a synthetic bench with a mock provider. That models the
 * mechanism but not real incusd contention, so "worst case 30.2s → 3.1s" was never evidence about
 * the box. This endpoint is that evidence: hit it during a real fleet update and read the numbers.
 *
 * In-memory and per-process, so it resets on deploy and reflects only the machine that answers.
 * That is fine for the question it exists to answer, and stating it beats implying otherwise.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const t = getPodService().liveSignalsTimings();
  return NextResponse.json({
    ...t,
    note:
      t.count === 0
        ? "No sweeps recorded yet on this machine — the numbers appear once the dashboard is polled."
        : "ms = one full owner sweep. probed = pods actually asked; breakered = pods skipped by the circuit breaker.",
  });
}
