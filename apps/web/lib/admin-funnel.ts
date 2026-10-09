import "server-only";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";
import { createAppDb, user as userTable, pods as podsTable, podEvents, session as sessionTable, landingExperimentEvents } from "@podway/db";
import { isAdmin } from "./access-rules";

/**
 * The sign-up funnel per first-touch ref (owner, 2026-10-08), from OUR database — every user counts,
 * no cookie consent needed (PostHog only sees visitors who accept cookies).
 *
 *   signed up   : accounts created in the window (admins excluded), grouped by user.ref
 *   created pod : a `created` pod event for the owner (kept after the pod is deleted)
 *   agent in    : a pod with authed_at, or the agent_connected landing event (deleted pods lose authed_at)
 *   came back   : a sign-in session, or pod activity, 24 h or more after sign-up
 */
export interface FunnelUser {
  id: string;
  ref: string | null;
  createdAt: Date;
}
export interface FunnelRow {
  ref: string;
  signedUp: number;
  createdPod: number;
  agentIn: number;
  cameBack: number;
}

export const DAY_MS = 86_400_000;

/** Pure: count each step per ref (+ a "All" total row first). Steps are nested: a later step only counts
 * users who also passed the earlier ones, so every row reads as a true funnel. */
export function computeFunnel(
  users: FunnelUser[],
  created: Set<string>,
  agentIn: Set<string>,
  lastSeen: Map<string, Date>,
): FunnelRow[] {
  const rows = new Map<string, FunnelRow>();
  const add = (key: string, u: FunnelUser) => {
    const r = rows.get(key) ?? { ref: key, signedUp: 0, createdPod: 0, agentIn: 0, cameBack: 0 };
    r.signedUp++;
    if (created.has(u.id)) {
      r.createdPod++;
      if (agentIn.has(u.id)) {
        r.agentIn++;
        const seen = lastSeen.get(u.id);
        if (seen && seen.getTime() - u.createdAt.getTime() >= DAY_MS) r.cameBack++;
      }
    }
    rows.set(key, r);
  };
  for (const u of users) {
    add("All", u);
    add(u.ref ?? "(no ref)", u);
  }
  const all = rows.get("All");
  const rest = [...rows.values()].filter((r) => r.ref !== "All").sort((a, b) => b.signedUp - a.signedUp || a.ref.localeCompare(b.ref));
  return all ? [all, ...rest] : rest;
}

/** Load the funnel for accounts created in the last `days` days. */
export async function loadFunnel(days: number, now = Date.now()): Promise<FunnelRow[]> {
  const db = createAppDb();
  const since = new Date(now - days * DAY_MS);
  const users = (await db
    .select({ id: userTable.id, ref: userTable.ref, createdAt: userTable.createdAt, email: userTable.email })
    .from(userTable)
    .where(gte(userTable.createdAt, since)))
    .filter((u) => !isAdmin(u.email));
  if (!users.length) return [];
  const ids = users.map((u) => u.id);
  const [createdRows, authedRows, connectedRows, sessions, podActivity] = await Promise.all([
    db.select({ owner: podEvents.ownerId }).from(podEvents).where(and(eq(podEvents.type, "created"), inArray(podEvents.ownerId, ids))),
    db.select({ owner: podsTable.ownerId }).from(podsTable).where(and(isNotNull(podsTable.authedAt), inArray(podsTable.ownerId, ids))),
    db.select({ owner: landingExperimentEvents.userId }).from(landingExperimentEvents)
      .where(and(eq(landingExperimentEvents.type, "agent_connected"), inArray(landingExperimentEvents.userId, ids))),
    db.select({ owner: sessionTable.userId, at: sessionTable.createdAt }).from(sessionTable).where(inArray(sessionTable.userId, ids)),
    db.select({ owner: podsTable.ownerId, at: podsTable.lastActiveAt }).from(podsTable).where(inArray(podsTable.ownerId, ids)),
  ]);
  const lastSeen = new Map<string, Date>();
  for (const { owner, at } of [...sessions, ...podActivity]) {
    if (owner && at && (!lastSeen.has(owner) || at > lastSeen.get(owner)!)) lastSeen.set(owner, at);
  }
  return computeFunnel(
    users,
    new Set(createdRows.map((r) => r.owner)),
    new Set([...authedRows, ...connectedRows].map((r) => r.owner).filter((x): x is string => !!x)),
    lastSeen,
  );
}
