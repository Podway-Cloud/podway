/**
 * The agent-card state machine, as pure functions so it can be TESTED.
 *
 * Extracted after three UI regressions in one day, two of which were decision
 * bugs (not styling): the pairing wizard auto-opened on a pod that already had a
 * paired device, because "devices haven't loaded yet" was indistinguishable from
 * "no devices". A regex over the component can't catch that; a unit test can.
 */

import type { RcState } from "@podway/shared/protocol";

export type LiveAgent = {
  id: string;
  window: number | null;
  authed: boolean;
  /** Was signed in, token hard-expired → distinct from never-signed-in (needs-signin). */
  loginExpired?: boolean;
  /** A LIVE mid-session logout (from the terminal), which the file-based loginExpired misses. Same
   * "reconnect" treatment. */
  needsReauth?: boolean;
  /** The login's HARD expiry (ms since epoch) — past which no refresh is possible. Drives the
   * "expiring soon · Reconnect" affordance while the login is still valid. */
  expiresAt?: number | null;
  rcActive: boolean;
  authUrl?: string | null;
  sessionUrl?: string | null;
  /** The shared RC lifecycle classification (rc-state.ts), independent of `rcActive` (which is
   * Codex-specific). Optional: absent on a pod image older than rc-reconnect-hardening — treat as
   * "no better evidence than the existing URL/auth signals", never as a state of its own. */
  rcState?: RcState;
  /** Whether this agent's CURRENT login can drive Remote Control at all (see PodAgentState's own
   * doc comment in protocol.ts) — Claude on an api-key/setup-token login never can, no matter how
   * long RC-restore is retried. Optional: absent on an older pod image ⇒ treat as capable (true),
   * same back-compat posture as `rcState`. */
  rcCapable?: boolean;
};

export type CardState =
  | "starting"
  | "not-running"
  | "needs-signin"
  | "login-expired"
  | "claude-ready"
  | "claude-linked"
  | "codex-on"
  | "codex-off"
  // rc-reconnect-hardening: Claude's rcState lifecycle, each distinctly named so it can never be
  // confused with the PRE-EXISTING "unknown" below (which means "the pod hasn't answered at all" —
  // a different situation with a different fix). Deliberately NOT reusing "unknown" for
  // rcState:"unknown" was the whole point of writing the mapping tests before naming these.
  | "claude-down" // rcState "down", valid login — Restore remote control is the fix.
  | "claude-recovering" // rcState "recovering" — bounded progress, no second concurrent action.
  | "claude-rc-unknown" // rcState "unknown" — RC could not be verified; never a spinner, never success.
  // A Claude login that CAN'T do RC at all (api-key/setup-token — rcCapable:false), distinct from
  // claude-down (a subscription login where RC merely isn't up right now): "Restore remote control"
  // can't fix this, only signing in with a subscription login can. Takes precedence over both
  // login-expired and claude-down so an authed-but-incapable login always shows the real fix.
  | "needs-subscription-signin"
  | "unknown";

/** How long a missing agent reads as "starting" before it reads as "not running". */
export const SPAWN_GRACE_MS = 30_000;

/**
 * True for a CardState that represents an otherwise-healthy, authed, signed-in agent — the set T3
 * dims to "Managed by T3" while it's in control (a not-signed-in or expired agent still needs
 * attention regardless of T3). Extracted as its own pure predicate — rather than an inline array
 * literal at the call site — because that inline form is exactly the kind of thing that silently goes
 * stale: `claude-down`/`claude-recovering`/`claude-rc-unknown` (rc-reconnect-hardening) were added as a
 * SPLIT of what used to be lumped into `claude-ready` alone, and a hand-maintained allowlist at the
 * render site missed them on the first pass (caught in review, not by a test, because no test existed
 * for this predicate at all). A pure function is the one place this list can be tested directly.
 */
export function isManagedableState(st: CardState): boolean {
  return (
    st === "claude-linked" ||
    st === "claude-ready" ||
    st === "claude-down" ||
    st === "claude-recovering" ||
    st === "claude-rc-unknown" ||
    // A setup-token pod under T3'S control is the one case where an rcCapable:false login is NOT a
    // problem — T3 drives the CLI over its own channel, no native RC needed (setupTokenAuthed's own
    // comment in control-plane/service.ts). So this state must still dim to "Managed by T3" rather
    // than show a confusing "sign in to enable remote control" prompt while T3 is in control; it's
    // only the real fix when Podway itself (not T3) is meant to own remote control.
    st === "needs-subscription-signin" ||
    st === "codex-on" ||
    st === "codex-off"
  );
}

export function agentCardState(input: {
  id: string;
  /** null = the pod hasn't answered yet. */
  live: LiveAgent[] | null;
  primaryAgent: string;
  /** Pod-level fallbacks, for images predating per-agent reporting. */
  sessionUrl: string | null;
  authedAt: string | null;
  legacyCodexRc: boolean;
  running: boolean;
  /** When this agent was first seen missing from a non-empty report. */
  missingSince?: number;
  /** An add/start is in flight for this agent. */
  startingNow: boolean;
  now: number;
}): CardState {
  const { id, live, running } = input;
  if (!running) return "unknown";

  const l = live?.find((s) => s.id === id);
  if (l) {
    // An AUTHED Claude whose login itself can never drive RC (api-key/setup-token) — checked before
    // login-expired/claude-down so it always wins over both: neither "Reconnect" (re-login on the
    // SAME incapable mode) nor "Restore remote control" (retrying a bridge that will never come up)
    // is the real fix here, only signing in with a subscription login is. Codex is unaffected —
    // its rcCapable is always true (see PodAgentState's doc comment).
    if (id !== "codex" && l.authed && l.rcCapable === false) return "needs-subscription-signin";
    // token died (file or live), OR the shared classifier says the login itself is blocking RC (a
    // recognized OAuth-retry/login-menu gate can outrank a still-present-looking credential file —
    // test:1's regression) → same Reconnect treatment either way.
    if (l.loginExpired || l.needsReauth || l.rcState === "login-required") return "login-expired";
    if (!l.authed) return "needs-signin";
    if (id === "codex") return l.rcActive ? "codex-on" : "codex-off";
    // Claude's RC lifecycle: when the pod reports it, defer to it for down/recovering/unknown rather
    // than collapsing all three into the old "Signed in — turning on remote control…" catch-all.
    // `active` deliberately falls through to the existing URL-presence check below rather than being
    // special-cased here: the classifier only derives "active" FROM a captured session URL in the
    // first place (rc-state.ts's `hasSessionUrl`), so the URL check is the more precise of the two
    // signals for deciding "claude-linked" (has this exact agent's own link right now?) vs
    // "claude-ready" (evidence is positive but no link to hand off yet) — checking it directly avoids
    // depending on the classifier's URL history being in lockstep with THIS agent's current record.
    if (l.rcState === "down") return "claude-down";
    if (l.rcState === "recovering") return "claude-recovering";
    if (l.rcState === "unknown") return "claude-rc-unknown";
    return l.sessionUrl || input.sessionUrl ? "claude-linked" : "claude-ready";
  }

  // The pod reports per-agent truth but not THIS agent: still spawning, or its
  // window was lost.
  if (live !== null && live.length > 0) {
    if (input.startingNow) return "starting";
    const first = input.missingSince ?? input.now;
    return input.now - first < SPAWN_GRACE_MS ? "starting" : "not-running";
  }

  // Degraded: no per-agent data at all (old image, or first poll pending).
  if (id === input.primaryAgent) {
    if (id === "codex") return input.legacyCodexRc ? "codex-on" : "unknown";
    if (input.sessionUrl) return "claude-linked";
    return input.authedAt ? "claude-ready" : "unknown";
  }
  return "unknown";
}
