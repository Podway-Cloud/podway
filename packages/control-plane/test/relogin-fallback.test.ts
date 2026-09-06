import { describe, it, expect } from "vitest";
import { reloginSucceeded } from "../src/service.js";

/**
 * reconnectAgent asks the pod to renew the login IN the live session (`/agent/relogin`) before
 * falling back to the historical wipe-and-respawn. The fallback is the safety net, so the ONLY
 * dangerous answer is a false yes: it would skip the respawn and leave the owner with a login that
 * was never renewed and nothing on screen to say so. These pin every "no" that must stay a no.
 */
describe("reloginSucceeded — when may reconnect SKIP the respawn fallback?", () => {
  it("yes, and only, on a reachable pod that answered ok:true", () => {
    expect(reloginSucceeded(0, JSON.stringify({ ok: true, agent: "claude-code", window: 0 }))).toBe(true);
  });

  it("no when the pod answered honestly that it could not do it", () => {
    for (const reason of ["agent-not-live", "unsupported-agent", "rc-incapable", "no-window"]) {
      expect(reloginSucceeded(0, JSON.stringify({ ok: false, reason })), reason).toBe(false);
    }
  });

  it("no when the pod was unreachable — an exec failure is not consent", () => {
    expect(reloginSucceeded(1, "")).toBe(false);
    expect(reloginSucceeded(7, JSON.stringify({ ok: true }))).toBe(false); // body ignored on failure
  });

  it("no on an empty or whitespace body", () => {
    expect(reloginSucceeded(0, "")).toBe(false);
    expect(reloginSucceeded(0, "   \n")).toBe(false);
  });

  it("no on a body that is not JSON — e.g. a proxy or shell error page", () => {
    expect(reloginSucceeded(0, "curl: (7) Failed to connect")).toBe(false);
    expect(reloginSucceeded(0, "<html>502</html>")).toBe(false);
  });

  it("no on TRUTHY-but-not-true ok — the strictness is the point", () => {
    expect(reloginSucceeded(0, JSON.stringify({ ok: "true" }))).toBe(false);
    expect(reloginSucceeded(0, JSON.stringify({ ok: 1 }))).toBe(false);
    expect(reloginSucceeded(0, JSON.stringify({ ok: {} }))).toBe(false);
  });

  it("no on JSON that is not an object, or has no ok at all", () => {
    expect(reloginSucceeded(0, "null")).toBe(false);
    expect(reloginSucceeded(0, "true")).toBe(false);
    expect(reloginSucceeded(0, "[1,2]")).toBe(false);
    expect(reloginSucceeded(0, JSON.stringify({ agent: "claude-code" }))).toBe(false);
  });
});
