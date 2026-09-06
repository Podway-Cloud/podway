import { describe, it, expect } from "vitest";
import { mintBridgeToken, verifyBridgeToken } from "../src/bridge-token.js";

const SECRET = "test-better-auth-secret-000000000000";
const now = 1_800_000_000_000;

describe("bridge-token", () => {
  it("round-trips a valid token (identity + pod + purpose)", () => {
    const t = mintBridgeToken({ userId: "u1", podId: "pod-a", purpose: "terminal", now, secret: SECRET });
    expect(verifyBridgeToken(t, { now, secret: SECRET })).toEqual({
      userId: "u1",
      podId: "pod-a",
      purpose: "terminal",
    });
  });

  it("rejects a token signed with a different secret (forgery)", () => {
    const t = mintBridgeToken({ userId: "u1", podId: "pod-a", purpose: "terminal", now, secret: SECRET });
    expect(verifyBridgeToken(t, { now, secret: "another-secret" })).toBeNull();
  });

  it("rejects a tampered payload (userId swapped)", () => {
    const t = mintBridgeToken({ userId: "u1", podId: "pod-a", purpose: "preview", now, secret: SECRET });
    const [, sig] = t.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ u: "attacker", pod: "pod-a", p: "preview", exp: now + 60_000 }),
      "utf8",
    ).toString("base64url");
    expect(verifyBridgeToken(`${forgedBody}.${sig}`, { now, secret: SECRET })).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = mintBridgeToken({ userId: "u1", podId: "pod-a", purpose: "terminal", now, ttlMs: 1000, secret: SECRET });
    expect(verifyBridgeToken(t, { now: now + 2000, secret: SECRET })).toBeNull();
  });

  it("accepts right up to expiry, rejects just after", () => {
    const t = mintBridgeToken({ userId: "u1", podId: "pod-a", purpose: "terminal", now, ttlMs: 1000, secret: SECRET });
    expect(verifyBridgeToken(t, { now: now + 1000, secret: SECRET })).not.toBeNull();
    expect(verifyBridgeToken(t, { now: now + 1001, secret: SECRET })).toBeNull();
  });

  it("rejects malformed tokens and empty input", () => {
    for (const bad of ["", "no-dot", ".", "a.", ".b", "garbage.garbage"]) {
      expect(verifyBridgeToken(bad, { now, secret: SECRET })).toBeNull();
    }
  });

  it("returns null when no secret is available (fails closed)", () => {
    const t = mintBridgeToken({ userId: "u1", podId: "pod-a", purpose: "terminal", now, secret: SECRET });
    expect(verifyBridgeToken(t, { now, secret: "" })).toBeNull();
  });

  it("carries the pod + purpose so the caller can scope-check", () => {
    const t = mintBridgeToken({ userId: "u1", podId: "pod-b", purpose: "preview", now, secret: SECRET });
    const v = verifyBridgeToken(t, { now, secret: SECRET });
    expect(v?.podId).toBe("pod-b");
    expect(v?.purpose).toBe("preview");
  });
});
