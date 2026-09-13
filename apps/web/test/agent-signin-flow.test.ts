import { describe, it, expect } from "vitest";
import { shouldCloseSignin } from "@/lib/agent-signin-flow";

/**
 * The wizard's close decision has broken ~20 times because it lived inline in a React effect and was
 * only ever exercised by hand on a live pod. These pin every case that has bitten us so a regression
 * fails CI instead of a frustrated owner (velsa).
 */
describe("shouldCloseSignin — the reconnect/sign-in wizard's 'are we done?' rule", () => {
  // The DEFAULTS a fresh wizard sees:
  //  - plain SIGN-IN: sawUnauthed starts TRUE (nothing to un-auth), sent false, authed false.
  //  - RECONNECT: sawUnauthed starts FALSE (agent is still authed), sent false, authed true.
  const base = { authed: false, loginUnhealthy: false, sawUnauthed: false, sent: false };

  it("never closes while unauthed — even if everything else says done", () => {
    expect(shouldCloseSignin({ ...base, authed: false, sawUnauthed: true, sent: true })).toBe(false);
  });

  describe("plain sign-in (sawUnauthed starts true)", () => {
    it("closes the moment the agent reports authed", () => {
      expect(shouldCloseSignin({ ...base, authed: true, sawUnauthed: true })).toBe(true);
    });
  });

  describe("reconnect on a DEAD token (agent went unauthed first)", () => {
    it("stays open on the initial authed frame before the wipe (sawUnauthed still false)", () => {
      // This is the 2026-08-26 flash-shut bug: closing here bounced the owner straight back to the card.
      expect(shouldCloseSignin({ ...base, authed: true, sawUnauthed: false })).toBe(false);
    });
    it("closes once it has gone unauthed and comes back authed", () => {
      expect(shouldCloseSignin({ ...base, authed: true, sawUnauthed: true })).toBe(true);
    });
  });

  describe("reconnect on a still-authed / EXPIRING token — 'Signing in… hangs forever' (2026-09-13)", () => {
    // The reconnect starts authed:true, needsReauth:true. The token NEVER goes unauthed — the renew
    // swaps it in place — so sawUnauthed stays false forever. The old rule waited for sawUnauthed and
    // hung. The fix: a submitted code + a now-healthy login is also 'done'.
    it("stays open before the code is submitted, even while healthy", () => {
      expect(shouldCloseSignin({ ...base, authed: true, loginUnhealthy: false, sent: false })).toBe(false);
    });
    it("stays open after the code is submitted while the login is STILL unhealthy (renew not landed)", () => {
      expect(shouldCloseSignin({ ...base, authed: true, loginUnhealthy: true, sent: true })).toBe(false);
    });
    it("CLOSES when the code is submitted and the login flips healthy (the renew landed)", () => {
      expect(shouldCloseSignin({ ...base, authed: true, loginUnhealthy: false, sent: true })).toBe(true);
    });
  });

  it("does not close on a submitted code alone if the agent is not authed", () => {
    expect(shouldCloseSignin({ ...base, authed: false, loginUnhealthy: false, sent: true })).toBe(false);
  });
});
