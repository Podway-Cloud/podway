import { describe, it, expect } from "vitest";
import { createTestDb, user } from "@podway/db";
import { DrizzlePodStore } from "../src/drizzle-store.js";
import { LoginReminderService, drizzleReminderDeps } from "../src/login-reminders.js";
import type { PodRecord } from "../src/types.js";

const DAY = 86_400_000;

/** The at-most-once rule lives in SQL (auth_notices PK + ON CONFLICT DO NOTHING) — test it on real
 * Postgres semantics (PGlite + the real migrations), not a fake. */
describe("login reminders on the real schema", () => {
  it("claims each notice once, respects the owner's email setting, and sees a renewal as new", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(user).values({ id: "o1", name: "Dana", email: "d@x.com" });
      const store = new DrizzlePodStore(db);
      const now = Date.now();
      const rec = { id: "pod-a", ownerId: "o1", name: "makore", environmentName: "nextjs-starter", status: "running", agentAuth: "subscription",
        claudeLoginExpiresAt: new Date(now + 2.5 * DAY).toISOString() } as unknown as PodRecord;
      await store.create({ ...(await fullRecord(rec)) });
      const messages: string[] = [];
      const emails: string[] = [];
      const svc = new LoginReminderService({
        ...drizzleReminderDeps(db),
        sendPodMessage: async (podId) => void messages.push(podId),
        sendEmail: async (to) => void emails.push(to),
        appUrl: "https://podway.io",
      });
      await svc.sweep(now);
      await svc.sweep(now + 60_000);
      expect(messages).toEqual(["pod-a"]);
      expect(emails).toEqual(["d@x.com"]);

      // Renewed: a new expiry is a new login — its own schedule, starting fresh.
      await store.update("pod-a", { claudeLoginExpiresAt: new Date(now + 2.5 * DAY + 30 * DAY).toISOString() });
      await svc.sweep(now + 28 * DAY); // 4.5 days left on the NEW login → its 7-day step: message, no email
      expect(messages).toEqual(["pod-a", "pod-a"]);
      expect(emails).toEqual(["d@x.com"]);

      // Owner turned reminder emails off: pod messages continue, emails stop.
      const { eq } = await import("@podway/db");
      await db.update(user).set({ reminderEmails: false }).where(eq(user.id, "o1"));
      await svc.sweep(now + 29.9 * DAY); // 2.6 days left → the 3-day step: message yes, email suppressed
      expect(messages.length).toBe(3);
      expect(emails).toEqual(["d@x.com"]);
    } finally {
      await close();
    }
  });
});

/** A complete PodRecord for store.create — the store needs every column. */
async function fullRecord(p: PodRecord): Promise<PodRecord> {
  return {
    region: "", keepAwake: false, lifecycle: "always-on", autoUpdate: "inherit", previewPublic: false, previewAppAuth: false,
    githubRepo: null, agents: ["claude-code"], authedAt: null, authUrl: null, codexDevices: null, sessionUrl: null, machineId: null,
    imageDigest: null, configHash: null, relentlessHold: false, relentlessWake: false, nonpaymentSuspendedAt: null, updatingSince: null,
    updateQueuedSince: null, maintenanceKind: null, updateStage: null, t3Control: false, t3Since: null, t3Stage: null, t3Connected: false,
    provider: "incus", size: "m", diskGb: 20, provisionAttempts: 0, provisionLeaseUntil: null, provisionError: null, walkthroughSeenAt: null,
    createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(),
    ...p,
  } as PodRecord;
}
