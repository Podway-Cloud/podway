import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendApprovalEmail, notifyOps } from "../src/notify.js";

const CFG = {
  saJson: JSON.stringify({ client_email: "sa@x.iam", private_key: "PEM" }),
  impersonate: "itzhak@podway.io",
  from: "Itzhak · Podway <hi@podway.io>",
};

/**
 * THE OUTAGE THIS PINS (found 2026-09-07). PODWAY_GMAIL_IMPERSONATE pointed at an address with no
 * domain-wide delegation, so every approval and invite email came back 401. Nobody knew for weeks:
 * a user signed up, saw success, and received nothing.
 *
 * Two reasons it was invisible, and the second is the worse one:
 *  1. the send was wrapped in a bare `catch { }`
 *  2. it never checked `res.ok` — a 401 does not THROW, fetch resolves, so there was no error to
 *     swallow in the first place. The code sailed straight past a rejected send.
 */
describe("a notification that does not go out says so", () => {
  let errs: string[];
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errs = [];
    spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void errs.push(String(a[0])));
  });
  afterEach(() => spy.mockRestore());

  it("REPORTS a 401 from Gmail — the exact failure that hid for weeks", async () => {
    const f = vi.fn(async () => new Response('{"error":"unauthorized_client"}', { status: 401 }));
    await sendApprovalEmail(
      { name: "Ada", email: "ada@x.com" },
      { ...CFG, fetchImpl: f as never, tokenFn: async () => "tok" },
    );
    expect(errs.some((l) => l.includes("notification_send_failed"))).toBe(true);
    expect(errs.some((l) => l.includes("401"))).toBe(true);
  });

  it("still does NOT throw — a failed notification must never break the approval", async () => {
    const f = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(
      sendApprovalEmail({ name: "A", email: "a@x.com" }, { ...CFG, fetchImpl: f as never, tokenFn: async () => "t" }),
    ).resolves.toBeUndefined();
  });

  it("says nothing when the send is accepted", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    await sendApprovalEmail(
      { name: "A", email: "a@x.com" },
      { ...CFG, fetchImpl: f as never, tokenFn: async () => "t" },
    );
    expect(errs.filter((l) => l.includes("notification_send_failed"))).toHaveLength(0);
  });

  it("reports a rejected Telegram alert too", async () => {
    const f = vi.fn(async () => new Response("bad chat id", { status: 400 }));
    await notifyOps("something broke", { fetchImpl: f as never, token: "t", chatId: "c" });
    expect(errs.some((l) => l.includes("notification_send_failed"))).toBe(true);
  });
});
