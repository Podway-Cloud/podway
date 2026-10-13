import "server-only";
import { and, inArray, lt } from "drizzle-orm";
import { createAppDb, podEvents, user as userTable } from "@podway/db";
import { getBillingService } from "./pod-service";

/**
 * Per-app monthly revenue for the app-maker revenue share (owner, 2026-10-09: 30% of what Podway EARNS on
 * an app's pods). Revenue = cash collected on paid Stripe invoices in the month, per pod, summed by the
 * pod's app; free pods and credit-paid amounts are $0. Active pods = pods of the app that existed during
 * the month (created before its end, not destroyed before its start).
 */
export const REV_SHARE = 0.3;

export interface RevenueRow {
  app: string;
  activePods: number;
  paidPods: number;
  revenueCents: number;
  shareCents: number;
}

/** Pure. lines: cash per subscription item; itemPod: item → pod; podApp: pod → app; active: pod ids alive in the month. */
export function computeRevenue(
  lines: { item: string; cashCents: number }[],
  itemPod: Map<string, string>,
  podApp: Map<string, string>,
  active: Set<string>,
): RevenueRow[] {
  const rows = new Map<string, RevenueRow & { paid: Set<string> }>();
  const row = (app: string) => {
    let r = rows.get(app);
    if (!r) rows.set(app, (r = { app, activePods: 0, paidPods: 0, revenueCents: 0, shareCents: 0, paid: new Set() }));
    return r;
  };
  for (const pod of active) row(podApp.get(pod) ?? "(unknown)").activePods++;
  for (const l of lines) {
    const pod = itemPod.get(l.item);
    const r = row(pod ? podApp.get(pod) ?? "(unknown)" : "(unmatched)");
    r.revenueCents += l.cashCents;
    if (pod && l.cashCents > 0) r.paid.add(pod);
  }
  return [...rows.values()]
    .map(({ paid, ...r }) => ({ ...r, paidPods: paid.size, shareCents: Math.round(r.revenueCents * REV_SHARE) }))
    .sort((a, b) => b.revenueCents - a.revenueCents || b.activePods - a.activePods || a.app.localeCompare(b.app));
}

/** "2026-10" → [start, end) in UTC. */
export function monthRange(month: string): [Date, Date] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return [new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 1))];
}

/** The month's revenue twice: by the pod's app (app-maker share) and by the owner's sign-up ref (creator share). */
export async function loadRevenue(month: string): Promise<{ byApp: RevenueRow[]; byRef: RevenueRow[] }> {
  const [from, to] = monthRange(month);
  const db = createAppDb();
  const [events, paid, users] = await Promise.all([
    db.select({ podId: podEvents.podId, ownerId: podEvents.ownerId, type: podEvents.type, at: podEvents.at, meta: podEvents.meta }).from(podEvents)
      .where(and(inArray(podEvents.type, ["created", "destroyed", "billing_item"]), lt(podEvents.at, to))),
    getBillingService().paidLinesBetween(from, to),
    db.select({ id: userTable.id, ref: userTable.ref }).from(userTable),
  ]);
  const userRef = new Map(users.map((u) => [u.id, u.ref ?? "(no ref)"]));
  const podRef = new Map<string, string>();
  const podApp = new Map<string, string>();
  const destroyedBefore = new Set<string>();
  const itemPod = new Map(paid.itemPods);
  for (const e of events) {
    const meta = (e.meta ?? {}) as { environmentName?: string; subscriptionItem?: string };
    if (e.type === "created" && meta.environmentName) podApp.set(e.podId, meta.environmentName);
    if (e.type === "created") podRef.set(e.podId, userRef.get(e.ownerId) ?? "(deleted user)");
    if (e.type === "destroyed" && e.at < from) destroyedBefore.add(e.podId);
    if (e.type === "billing_item" && meta.subscriptionItem) itemPod.set(meta.subscriptionItem, e.podId);
  }
  const active = new Set([...podApp.keys()].filter((p) => !destroyedBefore.has(p)));
  return {
    byApp: computeRevenue(paid.lines, itemPod, podApp, active),
    byRef: computeRevenue(paid.lines, itemPod, podRef, active),
  };
}
