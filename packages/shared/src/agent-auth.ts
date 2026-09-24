import type { AgentAuth } from "./schema.js";

/**
 * The ONE place an agent's login state is decided (openspec: agent-auth-state).
 *
 * Login state used to be derived three times — pod-agent signals, control-plane's setup-token mask,
 * web's card ordering — and they disagreed, which is why sign-in broke ~20 times. The pod-agent calls
 * this and reports the result; everything else only renders it. Pure: no I/O, `now` is an input.
 */

/** A login the pod started (boot or relogin). `value` is the sign-in URL (Claude) or device code (Codex). */
export interface AgentLoginAttempt {
  running: boolean;
  value: string | null;
  issuedAt: number | null;
  expiresAt: number | null;
}

export interface AgentAuthInput {
  agent: string;
  /** Claude's auth mode, read fresh from the pod-spec. null = subscription. Ignored for Codex. */
  mode: AgentAuth | null;
  /** T3 (not Podway) drives the pod — the only case a setup-token / API key is usable. */
  t3Control: boolean;
  /** The pod answered. */
  reporting: boolean;
  /** The subscription credentials file (~/.claude/.credentials.json, ~/.codex/auth.json). */
  credentials: "absent" | "valid" | "expired";
  /** A setup-token / API key is present in the pod's environment. */
  tokenPresent: boolean;
  /** The agent's pane shows a logout / rejected sign-in. */
  needsReauth: boolean;
  /** The most recent login the pod started for this agent, if any. */
  login: AgentLoginAttempt | null;
  now: number;
}

export type NeedsLoginReason = "never" | "expired" | "rejected" | "login-exited";

export type AgentAuthState =
  | { state: "signed-in" }
  | { state: "login-pending"; value: string | null; issuedAt: number | null; expiresAt: number | null }
  | { state: "needs-login"; reason: NeedsLoginReason }
  | { state: "wrong-mode" }
  | { state: "unknown" };

export function classifyAgentAuth(i: AgentAuthInput): AgentAuthState {
  if (!i.reporting) return { state: "unknown" };

  // Claude on a setup-token / API key: usable ONLY when T3 drives the pod (the token is inference-only
  // and can never run remote control). Under Podway the only fix is a subscription login.
  if (i.agent !== "codex" && (i.mode === "setup-token" || i.mode === "api-key")) {
    if (!i.t3Control) return { state: "wrong-mode" };
    return i.tokenPresent ? { state: "signed-in" } : { state: "needs-login", reason: "never" };
  }

  // A login running NOW with a fresh value wins — including a reconnect of a still-valid login, whose
  // link the owner must see. A value with no future expiry is never served (the stale-code bug).
  const l = i.login;
  const fresh = l != null && (l.value == null || (l.expiresAt != null && l.expiresAt > i.now));
  if (l?.running && fresh) {
    return { state: "login-pending", value: l.value, issuedAt: l.issuedAt, expiresAt: l.expiresAt };
  }

  if (i.credentials === "valid" && !i.needsReauth) return { state: "signed-in" };

  if (l != null) return { state: "needs-login", reason: "login-exited" };
  if (i.needsReauth) return { state: "needs-login", reason: "rejected" };
  if (i.credentials === "expired") return { state: "needs-login", reason: "expired" };
  return { state: "needs-login", reason: "never" };
}

/**
 * `authState` for a pod whose image predates it (it only sends the raw fields). Same classifier, fed
 * from what an old pod-agent reports plus the control plane's own record of the mode and T3 control.
 * Two things an old image cannot tell us are assumed: a setup-token/api-key is present (the control
 * plane only sets that mode after storing it), and a served sign-in value is live (old images do not
 * report its age). Remove once every pod runs an image that sends `authState`.
 */
export function legacyAgentAuthState(
  a: { id: string; authed: boolean; loginExpired?: boolean; needsReauth?: boolean; authUrl?: string | null },
  mode: AgentAuth | null | undefined,
  t3Control: boolean | null | undefined,
  now: number,
): AgentAuthState {
  return classifyAgentAuth({
    agent: a.id,
    mode: mode ?? null,
    t3Control: t3Control === true,
    reporting: true,
    credentials: a.authed ? "valid" : a.loginExpired ? "expired" : "absent",
    tokenPresent: true,
    needsReauth: a.needsReauth === true,
    login: a.authUrl ? { running: true, value: a.authUrl, issuedAt: null, expiresAt: now + 1 } : null,
    now,
  });
}
