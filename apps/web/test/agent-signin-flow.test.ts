import { describe, it, expect } from "vitest";
import { signinDone, signinValue } from "@/lib/agent-signin-flow";

const pending = (value: string | null) => ({ state: "login-pending" as const, value, issuedAt: 1, expiresAt: 2 });

describe("signinDone — close only on signed-in, after a not-signed-in frame", () => {
  it("plain sign-in: closes on the first signed-in", () => {
    expect(signinDone({ state: "signed-in" }, true)).toBe(true);
  });
  it("reconnect of a still-valid login: the opening signed-in frame does NOT close it", () => {
    expect(signinDone({ state: "signed-in" }, false)).toBe(false);
  });
  it("never closes on anything but signed-in (t3tt: closed on 'ok', cockpit still said expired)", () => {
    for (const s of [pending("u"), { state: "needs-login" as const, reason: "expired" as const }, { state: "wrong-mode" as const }, { state: "unknown" as const }])
      expect(signinDone(s, true), s.state).toBe(false);
    expect(signinDone(undefined, true)).toBe(false);
  });
});

describe("signinValue — never show a value from an ended login", () => {
  it("GTM: the login exited → no value, even with a sticky or polled one", () => {
    expect(signinValue({ state: "needs-login", reason: "login-exited" }, "DEAD-12345", "DEAD-12345")).toEqual({ value: null, ended: true });
  });
  it("a live login's value wins", () => {
    expect(signinValue(pending("NEW-1"), "OLD", "OLD")).toEqual({ value: "NEW-1", ended: false });
  });
  it("Claude's link scrolled away after approval → keep showing the last one (paste box stays)", () => {
    expect(signinValue({ state: "needs-login", reason: "never" }, null, "https://claude.ai/oauth/x")).toEqual({
      value: "https://claude.ai/oauth/x",
      ended: false,
    });
  });
  it("a relogin that has not printed yet → nothing to show", () => {
    expect(signinValue(pending(null), null, null)).toEqual({ value: null, ended: false });
  });
});
