import "server-only";
import { createHash } from "node:crypto";
import { AgentMessages, SYSTEM_SENDER } from "@podway/control-plane";
import { notifyOps } from "@podway/auth";
import { createAppDb, pods as podsTable, eq } from "@podway/db";

/**
 * Crash alerting (leaner v1): on a server crash, ping the ops Telegram AND wake the crash-alert pod
 * so an agent triages + fixes — deduped so a storm of the same error alerts once. Everything here is
 * best-effort and fully swallowed: a crash reporter must NEVER itself crash a request.
 *
 * Sources: `instrumentation.ts` `onRequestError` (server components, server actions, route handlers).
 * Client-only crashes are already captured by PostHog (error.tsx). Telegram reuses the signup-notify
 * bot (`TELEGRAM_OPS_*`); the wake target is `PODWAY_CRASH_ALERT_POD` (a pod slug), owner resolved
 * from the pods table. Both no-op when unset.
 */

const DEDUP_MS = 30 * 60 * 1000; // one alert per fingerprint per 30 min
const seen = new Map<string, number>();

function fingerprint(digest: string | undefined, message: string, path: string): string {
  const raw = digest || createHash("sha1").update(`${message}\n${path}`).digest("hex").slice(0, 16);
  return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 40) || "unknown";
}

export interface CrashInput {
  message?: string;
  digest?: string;
  path?: string;
  kind?: string;
}

export async function reportCrash(input: CrashInput): Promise<void> {
  try {
    const message = (input.message ?? "").slice(0, 500);
    const path = input.path ?? "?";
    const fp = fingerprint(input.digest, message, path);
    const now = Date.now();

    const last = seen.get(fp);
    if (last && now - last < DEDUP_MS) return; // already alerted for this crash recently
    seen.set(fp, now);
    if (seen.size > 1000) for (const [k, t] of seen) if (now - t > DEDUP_MS) seen.delete(k);

    const code = input.digest ?? fp;

    // 1) Human alert — the ops Telegram chat (reuses the signup-notify bot).
    await notifyOps(
      `🚨 Podway crash (${input.kind ?? "server"})\npath: ${path}\ncode: ${code}\n${message.slice(0, 300)}`,
    ).catch(() => undefined);

    // 2) Wake an agent to triage + fix, via a system pod message (route() is idempotent on the id,
    //    so a re-fire within the same window collapses to one wake).
    const toPod = process.env.PODWAY_CRASH_ALERT_POD;
    if (toPod) {
      const db = createAppDb();
      const rows = await db
        .select({ owner: podsTable.ownerId })
        .from(podsTable)
        .where(eq(podsTable.id, toPod));
      const ownerId = rows[0]?.owner;
      if (ownerId) {
        const win = Math.floor(now / DEDUP_MS);
        await new AgentMessages(db)
          .route({
            id: `crash-${fp}-${win}`,
            ownerId,
            fromPod: SYSTEM_SENDER,
            toPod,
            body: `🚨 Crash on ${path} (code ${code}): ${message.slice(0, 200)}\nTriage: pull the digest from the web logs + PostHog (session replay), find the root cause, fix.`,
          })
          .catch(() => undefined);
      }
    }
  } catch {
    /* never let the crash reporter crash the request */
  }
}
