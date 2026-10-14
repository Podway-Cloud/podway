import { describe, expect, it } from "vitest";
import { NightUpdateService, localDateHour, type BehindPod, type NightOwner } from "../src/night-update.js";

const owner: NightOwner = { id: "u", tz: "Asia/Jerusalem", name: "Itzhak", email: "o@x.io" };
const pod = (id: string, over: Partial<BehindPod> = {}): BehindPod => ({
  id, name: id, status: "running", autoUpdate: "inherit", t3Control: false, ...over,
});

function setup(at: string, behind: BehindPod[], started: string[]) {
  let now = new Date(at);
  const updates: string[] = [];
  const mails: { subject: string; paragraphs: unknown[] }[] = [];
  const svc = new NightUpdateService({
    listOwners: async () => [owner],
    behindPods: async () => behind,
    updateIdle: async (o) => (updates.push(o), started),
    sendEmail: async (_to, subject, c) => void mails.push({ subject, paragraphs: c.paragraphs }),
    appUrl: "https://podway.io",
    now: () => now,
  });
  return { svc, updates, mails, setNow: (s: string) => (now = new Date(s)) };
}

describe("night auto-update", () => {
  it("reads the owner's local hour", () => {
    expect(localDateHour(new Date("2026-10-14T00:30:00Z"), "Asia/Jerusalem")).toEqual({ date: "2026-10-14", hour: 3 });
    expect(localDateHour(new Date(), "Not/AZone")).toBeNull();
  });

  it("runs once a night inside 03:00–05:00 local, then emails what updated and what was skipped", async () => {
    const t = setup("2026-10-13T21:00:00Z", [pod("a"), pod("b", { autoUpdate: "off" })], ["a"]); // 00:00 local
    expect(await t.svc.sweep()).toEqual([]); // outside the window
    t.setNow("2026-10-14T00:15:00Z"); // 03:15 local
    expect(await t.svc.sweep()).toEqual(["u"]);
    t.setNow("2026-10-14T01:30:00Z"); // 04:30 local, same night
    expect(await t.svc.sweep()).toEqual([]);
    expect(t.updates).toEqual(["u"]);
    expect(t.mails).toHaveLength(1);
    expect(t.mails[0].subject).toBe("Podway updated 1 pod last night");
    expect(t.mails[0].paragraphs).toContain("Updated: a.");
    expect(t.mails[0].paragraphs).toContain("Not updated: b — auto-update is off for this pod. It will try again tomorrow night.");
  });

  it("does not run after 05:00 local", async () => {
    const t = setup("2026-10-14T02:30:00Z", [pod("a")], ["a"]); // 05:30 local
    expect(await t.svc.sweep()).toEqual([]);
    expect(t.updates).toEqual([]);
  });

  it("does nothing and sends nothing when no pod is behind", async () => {
    const t = setup("2026-10-14T00:15:00Z", [], []);
    expect(await t.svc.sweep()).toEqual(["u"]);
    expect(t.updates).toEqual([]);
    expect(t.mails).toEqual([]);
  });
});
