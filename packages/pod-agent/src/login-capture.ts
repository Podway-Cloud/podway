/**
 * Sign-in value capture for a running agent login (agent-auth-state D4). Pure, so the stale-code bug
 * is pinned by a test: the old capture was sticky forever, took the FIRST code in the pane (the oldest
 * attempt's), and never noticed the login had exited — the GTM pod served a timed-out Codex code for
 * hours and OpenAI rejected it.
 *
 * Stickiness is kept on purpose (a sign-in value scrolls out of the pane seconds after it prints), but
 * it now ENDS when the login exits, and every value carries issuedAt/expiresAt so the classifier can
 * refuse to serve an expired one.
 */

/** A device code / OAuth link is good for this long after it first appears (Codex prints 15 min). */
export const LOGIN_TTL_MS = 15 * 60 * 1000;

export interface LoginAttempt {
  value: string | null;
  issuedAt: number | null;
  expiresAt: number | null;
  running: boolean;
}

/** Markers that the login is OVER — failed, or succeeded (a finished login must not stay "running",
 * or a still-pending attempt would outrank the credential it just produced). */
const EXIT_RE = /PODWAY-AGENT-EXITED|device auth timed out|Error logging in|Successfully logged in|Login successful/;
const CODEX_CODE_RE = /\b[A-Z0-9]{4}-[A-Z0-9]{4,6}\b/;

/**
 * Read one login attempt out of a pane. Codex: the code printed after the LAST device prompt. Claude:
 * the last complete auth URL (`urls`, pre-filtered by the caller's link extractor). `exited` = an exit
 * marker appears after the last login prompt.
 */
export function parseLoginPane(
  agent: string,
  pane: string,
  urls: string[] = [],
): { value: string | null; exited: boolean } {
  const promptIdx =
    agent === "codex"
      ? pane.lastIndexOf("codex/device")
      : Math.max(pane.lastIndexOf("Paste code"), pane.lastIndexOf("oauth/authorize"));
  const exited = promptIdx === -1 ? EXIT_RE.test(pane) : EXIT_RE.test(pane.slice(promptIdx));
  if (agent === "codex") {
    if (promptIdx === -1) return { value: null, exited: false };
    const m = pane.slice(promptIdx).match(CODEX_CODE_RE);
    return { value: m ? m[0] : null, exited };
  }
  return { value: urls.length ? urls[urls.length - 1] : null, exited };
}

/** Fold one scrape into the agent's current attempt. */
export function nextLoginAttempt(
  prev: LoginAttempt | null,
  parsed: { value: string | null; exited: boolean },
  now: number,
): LoginAttempt | null {
  if (parsed.exited) {
    if (prev) return { ...prev, running: false };
    // First sight of an already-dead login (e.g. pod-agent restarted onto an old pane): record it as
    // exited so the owner is told to get a new code — never served.
    return parsed.value ? { value: parsed.value, issuedAt: null, expiresAt: null, running: false } : null;
  }
  if (parsed.value) {
    if (prev?.value === parsed.value) return prev; // same code → keep its ORIGINAL issuedAt
    return { value: parsed.value, issuedAt: now, expiresAt: now + LOGIN_TTL_MS, running: true };
  }
  return prev; // scrolled away, or a relogin that has not printed yet
}
