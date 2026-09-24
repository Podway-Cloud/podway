import { describe, it, expect } from "vitest";
import { parseLoginPane, nextLoginAttempt, LOGIN_TTL_MS } from "../src/login-capture.js";

// Real pane from the GTM pod (2026-09-24): the device-auth login timed out and the launcher gave up.
// The dashboard kept serving this code for hours; OpenAI rejected it.
const GTM_EXITED = `Welcome to Codex [v0.156.1]
Follow these steps to sign in with ChatGPT using device code authorization:
1. Open this link in your browser and sign in to your account
   https://auth.openai.com/codex/device
2. Enter this one-time code (expires in 15 minutes)
   VSO4-NHSX4
Continue only if you started this login in Codex. If a website or another person
 gave you this code, cancel.
Error logging in with device code: device auth timed out after 15 minutes
PODWAY-AGENT-EXITED - the agent is NOT running. This is a plain shell; commands
typed here will not reach the agent. Run: podway-agent-restart`;

const CODEX_LIVE = `Follow these steps to sign in with ChatGPT using device code authorization:
1. Open this link in your browser and sign in to your account
   https://auth.openai.com/codex/device
2. Enter this one-time code (expires in 15 minutes)
   WXYZ-12345
Continue only if you started this login in Codex.`;

describe("parseLoginPane", () => {
  it("codex: a live device login → its code, not exited", () => {
    expect(parseLoginPane("codex", CODEX_LIVE)).toEqual({ value: "WXYZ-12345", exited: false });
  });

  it("codex: the GTM pane — login timed out → exited (its code must not be served)", () => {
    expect(parseLoginPane("codex", GTM_EXITED)).toEqual({ value: "VSO4-NHSX4", exited: true });
  });

  it("codex: two attempts in the pane → the LAST code (the old first-match served a dead one)", () => {
    const pane = `${GTM_EXITED}\n$ podway-agent-restart\n${CODEX_LIVE}`;
    expect(parseLoginPane("codex", pane)).toEqual({ value: "WXYZ-12345", exited: false });
  });

  it("codex: a SUCCESSFUL login also ends the attempt (else pending would outrank the new credential)", () => {
    expect(parseLoginPane("codex", `${CODEX_LIVE}\nSuccessfully logged in`)).toEqual({ value: "WXYZ-12345", exited: true });
  });

  it("codex: no device prompt → nothing", () => {
    expect(parseLoginPane("codex", "codex> working on it\nABCD-1234 is a ticket id")).toEqual({ value: null, exited: false });
  });

  it("claude: last complete auth URL wins; agent exit after it → exited", () => {
    const urls = ["https://claude.ai/oauth/authorize?a=1", "https://claude.ai/oauth/authorize?a=2"];
    expect(parseLoginPane("claude-code", "Paste code here if prompted >", urls)).toEqual({
      value: "https://claude.ai/oauth/authorize?a=2",
      exited: false,
    });
    expect(parseLoginPane("claude-code", "Paste code here >\nPODWAY-AGENT-EXITED - the agent is NOT running", urls)).toEqual({
      value: "https://claude.ai/oauth/authorize?a=2",
      exited: true,
    });
  });
});

describe("nextLoginAttempt", () => {
  const T = 1_800_000_000_000;
  it("a new value starts a fresh attempt with issuedAt = now", () => {
    expect(nextLoginAttempt(null, { value: "A-1", exited: false }, T)).toEqual({
      value: "A-1", issuedAt: T, expiresAt: T + LOGIN_TTL_MS, running: true,
    });
  });
  it("the same value keeps its original issuedAt (a re-scrape never refreshes an old code)", () => {
    const prev = { value: "A-1", issuedAt: T - 60_000, expiresAt: T - 60_000 + LOGIN_TTL_MS, running: true };
    expect(nextLoginAttempt(prev, { value: "A-1", exited: false }, T)).toEqual(prev);
  });
  it("the value scrolled out of the pane → keep the attempt (the reason capture was sticky)", () => {
    const prev = { value: "A-1", issuedAt: T, expiresAt: T + LOGIN_TTL_MS, running: true };
    expect(nextLoginAttempt(prev, { value: null, exited: false }, T + 5_000)).toEqual(prev);
  });
  it("the login exited → attempt stops running (value is kept only as a record, never served)", () => {
    const prev = { value: "A-1", issuedAt: T, expiresAt: T + LOGIN_TTL_MS, running: true };
    expect(nextLoginAttempt(prev, { value: "A-1", exited: true }, T + 5_000)).toEqual({ ...prev, running: false });
  });
  it("a relogin that has not printed yet stays pending with no value", () => {
    const started = { value: null, issuedAt: null, expiresAt: null, running: true };
    expect(nextLoginAttempt(started, { value: null, exited: false }, T)).toEqual(started);
  });
});
