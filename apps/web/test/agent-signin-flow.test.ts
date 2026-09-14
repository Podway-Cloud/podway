import { describe, it, expect } from "vitest";
import { shouldCloseSignin, renewConfirmed, expiryExtended } from "@/lib/agent-signin-flow";

/**
 * The wizard's close decision has broken ~20 times because it lived inline in a React effect and was
 * only ever exercised by hand on a live pod. These pin every case that has bitten us so a regression
 * fails CI instead of a frustrated owner (velsa).
 */
describe("shouldCloseSignin — the reconnect/sign-in wizard's 'are we done?' rule", () => {
  const base = { authed: false, sawUnauthed: false, sent: false, renewConfirmed: false };

  it("never closes while unauthed — even if everything else says done", () => {
    expect(shouldCloseSignin({ ...base, authed: false, sawUnauthed: true, sent: true, renewConfirmed: true })).toBe(false);
  });

  describe("plain sign-in / dead-token reconnect (sawUnauthed)", () => {
    it("closes the moment the agent reports authed after an unauthed gap", () => {
      expect(shouldCloseSignin({ ...base, authed: true, sawUnauthed: true })).toBe(true);
    });
    it("stays open on the initial authed frame before the wipe (sawUnauthed still false) — the 2026-08-26 flash-shut bug", () => {
      expect(shouldCloseSignin({ ...base, authed: true, sawUnauthed: false })).toBe(false);
    });
  });

  describe("reconnect on a still-valid EXPIRING login — must wait for PROOF, not a typed code", () => {
    // The 2026-09-13 premature-close bug: the login is healthy the whole time, so closing on submit-alone
    // shut the wizard before the renew completed and the cockpit still said "expires soon · Reconnect".
    it("does NOT close on a submitted code that is not yet PROVEN to have renewed", () => {
      expect(shouldCloseSignin({ ...base, authed: true, sent: true, renewConfirmed: false })).toBe(false);
    });
    it("CLOSES once the code is submitted AND the renewal is proven", () => {
      expect(shouldCloseSignin({ ...base, authed: true, sent: true, renewConfirmed: true })).toBe(true);
    });
    it("does NOT close on proof alone before a code was even submitted", () => {
      expect(shouldCloseSignin({ ...base, authed: true, sent: false, renewConfirmed: true })).toBe(false);
    });
  });
});

describe("renewConfirmed — positive proof a reconnect landed", () => {
  it("proven when the login's ill-health cleared (needsReauth/expired → healthy)", () => {
    expect(renewConfirmed({ unhealthyCleared: true, expiryExtended: false })).toBe(true);
  });
  it("proven when the hard expiry moved forward (fresh token) even if it was never ill", () => {
    expect(renewConfirmed({ unhealthyCleared: false, expiryExtended: true })).toBe(true);
  });
  it("NOT proven when neither changed — a healthy login with an unmoved expiry", () => {
    expect(renewConfirmed({ unhealthyCleared: false, expiryExtended: false })).toBe(false);
  });
});

describe("expiryExtended — the hard expiry moved meaningfully forward", () => {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  it("a fresh ~30d expiry over an expiring ~6d one IS extended", () => {
    expect(expiryExtended(now + 6 * DAY, now + 30 * DAY)).toBe(true);
  });
  it("the same expiry (a token refresh that did not move the hard clock) is NOT extended", () => {
    expect(expiryExtended(now + 6 * DAY, now + 6 * DAY)).toBe(false);
    expect(expiryExtended(now + 6 * DAY, now + 6 * DAY + 60_000)).toBe(false); // under the 1h margin
  });
  it("no current reading, or no baseline, is NOT proof", () => {
    expect(expiryExtended(now + 6 * DAY, null)).toBe(false);
    expect(expiryExtended(null, now + 30 * DAY)).toBe(false);
  });
});
