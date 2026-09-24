/**
 * The sign-in wizard's two decisions, as pure functions so they are unit-tested
 * (agent-signin-flow.test.ts). Both read the ONE classified `authState` (agent-auth-state) — the
 * wizard no longer re-derives login health from raw fields, which is how it broke ~20 times.
 */
import type { AgentAuthState } from "@podway/shared";

/**
 * Done = the pod says signed-in AND we saw it NOT signed in since the wizard opened. A reconnect of
 * a still-valid (expiring) login starts signed-in, so closing on that first frame flashed the wizard
 * shut (2026-08-26); the relogin shows login-pending, then signed-in once the new login lands. A
 * plain sign-in starts with `sawNotSignedIn` true.
 */
export function signinDone(state: AgentAuthState | undefined, sawNotSignedIn: boolean): boolean {
  return state?.state === "signed-in" && sawNotSignedIn;
}

/**
 * What sign-in value to show. A value from a login that has ENDED is never shown (GTM served a dead
 * Codex code for hours, 2026-09-24) — the wizard offers "Get a new code" instead. Otherwise the live
 * value, else the last one seen: Claude's link scrolls off the pod's screen the moment the owner
 * approves, and the paste box must stay put through that (2026-09-12).
 */
export function signinValue(
  state: AgentAuthState | undefined,
  polled: string | null,
  sticky: string | null,
): { value: string | null; ended: boolean } {
  if (state?.state === "needs-login" && state.reason === "login-exited") return { value: null, ended: true };
  if (state?.state === "login-pending" && state.value) return { value: state.value, ended: false };
  return { value: polled ?? sticky, ended: false };
}
