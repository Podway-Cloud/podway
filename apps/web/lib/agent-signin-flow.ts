/**
 * The reconnect/sign-in wizard's "are we done?" decision, extracted so the state machine that has
 * broken repeatedly is covered by unit tests (see agent-signin-flow.test.ts). The wizard (a client
 * component reading a live 3s poll) only wires these inputs to react state; the RULE lives here.
 *
 * The history it encodes:
 * - A plain SIGN-IN starts unauthed → the first `authed` is success.
 * - A RECONNECT starts on a STILL-authed agent whose login is only EXPIRING (that's what raised
 *   "Reconnect"). Closing on that initial `authed` flashed the wizard shut (2026-08-26) — so we wait
 *   until the reconnect is PROVEN to have landed: we saw the agent go unauthed and come back (a
 *   dead-token reconnect), OR — after the owner submitted a code — the login is DEMONSTRABLY renewed.
 * - "Demonstrably renewed" is NOT "a code was typed": on a still-valid expiring login the pod is healthy
 *   the whole time, so closing on submit-alone shut the wizard before the renew completed and the cockpit
 *   still showed "expires soon · Reconnect" — looked like it did nothing (velsa, podway dev, 2026-09-13).
 *   Proof is a positive change: the login's ill-health CLEARED, or its hard expiry moved FORWARD.
 */
export interface ReconnectCloseInput {
  /** The agent reports a valid login right now. */
  authed: boolean;
  /** We have observed the agent go unauthed at least once since the wizard opened. */
  sawUnauthed: boolean;
  /** The owner has submitted a sign-in code. */
  sent: boolean;
  /** Positive proof the reconnect LANDED a new login (see {@link renewConfirmed}) — never merely that
   * a code was typed. */
  renewConfirmed: boolean;
}

/** Whether the wizard should close (reconnect/sign-in is done). */
export function shouldCloseSignin({ authed, sawUnauthed, sent, renewConfirmed }: ReconnectCloseInput): boolean {
  if (!authed) return false; // never close while unauthed
  // Closed by an observed unauthed→authed transition (dead-token reconnect, or a plain sign-in whose
  // sawUnauthed starts true), OR by a submitted code whose renewal is PROVEN (not just typed).
  return sawUnauthed || (sent && renewConfirmed);
}

/** Positive proof a reconnect renewed the login: the login's ill-health cleared (a needsReauth/expired
 * login went healthy), OR its hard expiry moved meaningfully forward (a fresh login resets the clock). */
export function renewConfirmed({
  unhealthyCleared,
  expiryExtended,
}: {
  unhealthyCleared: boolean;
  expiryExtended: boolean;
}): boolean {
  return unhealthyCleared || expiryExtended;
}

/** Has the login's hard expiry moved meaningfully FORWARD from where it was when the wizard opened?
 * A real reconnect adds weeks; `marginMs` only rejects jitter and the tiny drift of a token refresh
 * (which does not move the hard expiry at all). Null current = no reading yet → not proven. */
export function expiryExtended(baseMs: number | null, curMs: number | null, marginMs = 60 * 60 * 1000): boolean {
  if (curMs == null || baseMs == null) return false;
  return curMs > baseMs + marginMs;
}
