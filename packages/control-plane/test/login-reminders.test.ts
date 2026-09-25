import { describe, it, expect } from "vitest";
import {
  dueThreshold,
  LoginReminderService,
  SUBSCRIPTION_SCHEDULE,
  SETUP_TOKEN_SCHEDULE,
  type ReminderPod,
} from "../src/login-reminders.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-01T12:00:00Z");

describe("dueThreshold — the most urgent threshold reached, never a burst", () => {
  it("subscription: 7d / 3d / 2d / 1d / expired", () => {
    const at = (d: number) => dueThreshold(SUBSCRIPTION_SCHEDULE, NOW + d * DAY, NOW)?.id ?? null;
    expect(at(10)).toBeNull();
    expect(at(6.5)).toBe("7d");
    expect(at(2.9)).toBe("3d");
    expect(at(1.5)).toBe("2d");
    expect(at(0.5)).toBe("1d");
    expect(at(-1)).toBe("expired");
  });
  it("setup-token: 14d / 3d / expired only", () => {
    const at = (d: number) => dueThreshold(SETUP_TOKEN_SCHEDULE, NOW + d * DAY, NOW)?.id ?? null;
    expect(at(20)).toBeNull();
    expect(at(10)).toBe("14d");
    expect(at(1)).toBe("3d");
    expect(at(-1)).toBe("expired");
  });
});

function harness(pods: ReminderPod[], opts: { reminderEmails?: boolean } = {}) {
  const sent = new Set<string>();
  const podMessages: { podId: string; body: string }[] = [];
  const emails: { ownerId: string; subject: string; pods: string[] }[] = [];
  const svc = new LoginReminderService({
    listPods: async () => pods,
    claimNotice: async (n) => {
      const k = `${n.podId}|${n.agent}|${n.expiresAt}|${n.threshold}`;
      if (sent.has(k)) return false;
      sent.add(k);
      return true;
    },
    sendPodMessage: async (podId, _ownerId, body) => void podMessages.push({ podId, body }),
    owner: async () => ({ name: "Dana", email: "d@x.com", reminderEmails: opts.reminderEmails ?? true }),
    sendEmail: async (_to, subject, content) =>
      void emails.push({ ownerId: "o1", subject, pods: content.paragraphs.map((p) => (typeof p === "string" ? p : p.label)) }),
    appUrl: "https://podway.io",
  });
  return { svc, podMessages, emails, sent };
}

const pod = (id: string, days: number, extra: Partial<ReminderPod> = {}): ReminderPod => ({
  id,
  name: id,
  ownerId: "o1",
  agentAuth: "subscription",
  claudeLoginExpiresAt: new Date(NOW + days * DAY).toISOString(),
  ...extra,
});

describe("LoginReminderService.sweep", () => {
  it("3 days out: one pod message with the reconnect link, one email", async () => {
    const h = harness([pod("makore", 2.9)]);
    await h.svc.sweep(NOW);
    expect(h.podMessages).toHaveLength(1);
    expect(h.podMessages[0]!.body).toContain("https://podway.io/dashboard/pods/makore?tab=control&wiz=reconnect:claude-code");
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0]!.subject).toMatch(/3 days/);
  });

  it("7 days out: pod message only, no email", async () => {
    const h = harness([pod("a", 6)]);
    await h.svc.sweep(NOW);
    expect(h.podMessages).toHaveLength(1);
    expect(h.emails).toHaveLength(0);
  });

  it("never sends the same notice twice (a restart / the next hourly sweep)", async () => {
    const h = harness([pod("a", 2.9)]);
    await h.svc.sweep(NOW);
    await h.svc.sweep(NOW + 3_600_000);
    expect(h.podMessages).toHaveLength(1);
    expect(h.emails).toHaveLength(1);
  });

  it("a renewal (new expiry) stops the old schedule: nothing for the new login until its own thresholds", async () => {
    const pods = [pod("a", 2.9)];
    const h = harness(pods);
    await h.svc.sweep(NOW);
    pods[0] = pod("a", 30); // reconnected: expiry moved ~30 days out
    await h.svc.sweep(NOW + DAY);
    expect(h.podMessages).toHaveLength(1);
  });

  it("ONE email per owner, listing every pod at a threshold", async () => {
    const h = harness([pod("a", 2.9), pod("b", 2.5), pod("c", 0.5)]);
    await h.svc.sweep(NOW);
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0]!.subject).toMatch(/3 pods|tomorrow/); // the most urgent leads
    expect(h.podMessages).toHaveLength(3);
  });

  it("reminder emails off → pod messages still go, no email", async () => {
    const h = harness([pod("a", 2.9)], { reminderEmails: false });
    await h.svc.sweep(NOW);
    expect(h.podMessages).toHaveLength(1);
    expect(h.emails).toHaveLength(0);
  });

  it("api-key pods and pods with no known expiry are skipped", async () => {
    const h = harness([pod("k", 1, { agentAuth: "api-key" }), pod("n", 1, { claudeLoginExpiresAt: null })]);
    await h.svc.sweep(NOW);
    expect(h.podMessages).toHaveLength(0);
  });

  it("an unexpected sign-out sends the 'expired' notice at once, once", async () => {
    const h = harness([]);
    const p = pod("a", 12);
    await h.svc.notifySignedOut(p, NOW);
    await h.svc.notifySignedOut(p, NOW + 90_000);
    expect(h.podMessages).toHaveLength(1);
    expect(h.podMessages[0]!.body).toMatch(/signed out|expired/i);
    expect(h.emails).toHaveLength(1);
  });
});
