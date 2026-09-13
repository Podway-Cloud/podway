/**
 * The reconnect/sign-in wizard's "are we done?" decision, extracted so the state machine that has
 * broken repeatedly is covered by unit tests (see agent-signin-flow.test.ts). The wizard (a client
 * component reading a live 3s poll) only wires these inputs to react state; the RULE lives here.
 *
 * The history it encodes:
 * - A plain SIGN-IN starts unauthed → the first `authed` is success.
 * - A RECONNECT starts on a STILL-authed agent whose login is only EXPIRING (that's what raised
 *   "Reconnect"). Closing on that initial `authed` flashed the wizard shut (2026-08-26) — so we wait
 *   until we've either SEEN it go unauthed (a dead-token reconnect), OR the owner submitted a code and
 *   the login is now HEALTHY again. The second clause fixes "Signing in… hangs forever": a renew on a
 *   still-authed token never goes unauthed, so the old "must have seen unauthed" rule never fired even
 *   though the renew succeeded (velsa 2026-09-13; pod was authed:true + needsReauth:false, UI still spun).
 */
export interface ReconnectCloseInput {
  /** The agent reports a valid login right now. */
  authed: boolean;
  /** The login is expiring / needs re-auth (needsReauth || loginExpired) — unhealthy. */
  loginUnhealthy: boolean;
  /** We have observed the agent go unauthed at least once since the wizard opened. */
  sawUnauthed: boolean;
  /** The owner has submitted a sign-in code. */
  sent: boolean;
}

/** Whether the wizard should close (reconnect/sign-in is done). */
export function shouldCloseSignin({ authed, loginUnhealthy, sawUnauthed, sent }: ReconnectCloseInput): boolean {
  if (!authed) return false; // never close while unauthed
  // Closed by an observed unauthed→authed transition (dead-token reconnect, or a plain sign-in whose
  // sawUnauthed starts true), OR by a code submission landing a healthy login (the expiring-token renew).
  return sawUnauthed || (sent && !loginUnhealthy);
}
