import { describe, it, expect } from "vitest";
import { classifyAgentAuth, type AgentAuthInput, legacyAgentAuthState } from "../src/agent-auth.js";

// The ONE place agent login state is decided (openspec: agent-auth-state). Every row below is a
// transition from design D2/D3 — if a row changes, the spec changes with it.
const NOW = 1_800_000_000_000;
const MIN = 60_000;

const base: AgentAuthInput = {
  agent: "claude-code",
  mode: "subscription",
  t3Control: false,
  reporting: true,
  credentials: "absent",
  tokenPresent: false,
  needsReauth: false,
  login: null,
  now: NOW,
};
const running = (value: string | null, ageMin = 1, ttlMin = 15) => ({
  running: true,
  value,
  issuedAt: value ? NOW - ageMin * MIN : null,
  expiresAt: value ? NOW - ageMin * MIN + ttlMin * MIN : null,
});
const exited = (value: string | null) => ({ ...running(value), running: false });

const cases: [string, Partial<AgentAuthInput>, ReturnType<typeof classifyAgentAuth>][] = [
  // --- pod not reporting
  ["pod not reporting", { reporting: false }, { state: "unknown" }],

  // --- subscription, both agents
  ["never signed in, no login running", {}, { state: "needs-login", reason: "never" }],
  ["valid credentials", { credentials: "valid" }, { state: "signed-in" }],
  ["expired credentials", { credentials: "expired" }, { state: "needs-login", reason: "expired" }],
  ["valid file but pane shows logout", { credentials: "valid", needsReauth: true }, { state: "needs-login", reason: "rejected" }],
  ["login just started, value not captured yet", { login: running(null) },
    { state: "login-pending", value: null, issuedAt: null, expiresAt: null }],
  ["login running with a fresh code", { login: running("ABCD-1234", 2) },
    { state: "login-pending", value: "ABCD-1234", issuedAt: NOW - 2 * MIN, expiresAt: NOW + 13 * MIN }],
  ["reconnect of a still-valid login shows the fresh link", { credentials: "valid", login: running("https://x", 1) },
    { state: "login-pending", value: "https://x", issuedAt: NOW - MIN, expiresAt: NOW + 14 * MIN }],
  // THE GTM BUG: the device-auth login exited (timed out) — its code must never be served.
  ["login exited, code left behind", { login: exited("VQZI-KM8DQ") }, { state: "needs-login", reason: "login-exited" }],
  ["login still running but its code expired", { login: running("OLD-CODE", 20, 15) }, { state: "needs-login", reason: "login-exited" }],
  ["login exited but creds landed → signed in", { credentials: "valid", login: exited("X") }, { state: "signed-in" }],

  // --- Claude on setup-token / api-key
  // THE t3tt BUG: setup-token with T3 off is useless under Podway control → only fix is subscription.
  ["setup-token, T3 off", { mode: "setup-token", tokenPresent: true }, { state: "wrong-mode" }],
  ["setup-token, T3 off, no token", { mode: "setup-token" }, { state: "wrong-mode" }],
  ["api-key, T3 off", { mode: "api-key", tokenPresent: true }, { state: "wrong-mode" }],
  ["setup-token, T3 on, token present", { mode: "setup-token", t3Control: true, tokenPresent: true }, { state: "signed-in" }],
  ["setup-token, T3 on, token missing", { mode: "setup-token", t3Control: true }, { state: "needs-login", reason: "never" }],
  ["subscription is unaffected by T3", { t3Control: true, credentials: "valid" }, { state: "signed-in" }],

  // --- Codex (device login only; its mode never makes it wrong-mode)
  ["codex never signed in", { agent: "codex" }, { state: "needs-login", reason: "never" }],
  ["codex pending with fresh code", { agent: "codex", login: running("WXYZ-9876", 3) },
    { state: "login-pending", value: "WXYZ-9876", issuedAt: NOW - 3 * MIN, expiresAt: NOW + 12 * MIN }],
  ["codex login timed out", { agent: "codex", login: exited("VQZI-KM8DQ") }, { state: "needs-login", reason: "login-exited" }],
  ["codex signed in", { agent: "codex", credentials: "valid" }, { state: "signed-in" }],
  ["codex expired auth.json", { agent: "codex", credentials: "expired" }, { state: "needs-login", reason: "expired" }],
  ["codex ignores a setup-token mode", { agent: "codex", mode: "setup-token" }, { state: "needs-login", reason: "never" }],
];

describe("classifyAgentAuth", () => {
  it.each(cases)("%s", (_name, over, want) => {
    expect(classifyAgentAuth({ ...base, ...over })).toEqual(want);
  });

  it("returns exactly one known state for every input combination", () => {
    const states = new Set(["signed-in", "login-pending", "needs-login", "wrong-mode", "unknown"]);
    for (const agent of ["claude-code", "codex"])
      for (const mode of ["subscription", "setup-token", "api-key"] as const)
        for (const t3Control of [false, true])
          for (const credentials of ["absent", "valid", "expired"] as const)
            for (const tokenPresent of [false, true])
              for (const needsReauth of [false, true])
                for (const login of [null, running(null), running("C", 1), running("C", 20), exited("C")]) {
                  const r = classifyAgentAuth({ ...base, agent, mode, t3Control, credentials, tokenPresent, needsReauth, login });
                  expect(states.has(r.state)).toBe(true);
                  // A dead or expired login value is NEVER served.
                  if (r.state === "login-pending" && r.value) expect(r.expiresAt!).toBeGreaterThan(NOW);
                }
  });
});

describe("legacyAgentAuthState (pods on an image without authState)", () => {
  const NOW = 1_800_000_000_000;
  it("maps the raw fields through the same classifier", () => {
    expect(legacyAgentAuthState({ id: "claude-code", authed: true }, "subscription", false, NOW)).toEqual({ state: "signed-in" });
    expect(legacyAgentAuthState({ id: "claude-code", authed: false, loginExpired: true }, "subscription", false, NOW)).toEqual({
      state: "needs-login",
      reason: "expired",
    });
    expect(legacyAgentAuthState({ id: "codex", authed: false, authUrl: "ABCD-12345" }, null, false, NOW)).toMatchObject({
      state: "login-pending",
      value: "ABCD-12345",
    });
  });
  it("setup-token: signed-in only under T3 (replaces the control plane's old setupTokenAuthed mask)", () => {
    expect(legacyAgentAuthState({ id: "claude-code", authed: false }, "setup-token", true, NOW)).toEqual({ state: "signed-in" });
    expect(legacyAgentAuthState({ id: "claude-code", authed: false }, "setup-token", false, NOW)).toEqual({ state: "wrong-mode" });
  });
});
