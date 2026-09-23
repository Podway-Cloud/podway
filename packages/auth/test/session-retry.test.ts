import { describe, it, expect } from "vitest";
import { getSessionWithRetry, isTransientDbError, withDbRetry } from "../src/index.js";

// Guards the graceful-degradation fix (owner: "REALLY BAD UX", 2026-09-22): a transient DB
// connection blip during the session read must be retried (an idempotent read) rather than
// hard-crash the dashboard — while a real error still surfaces immediately.

type Behavior = "transient" | "fatal" | { user: { id: string } } | null;

function fakeAuth(seq: Behavior[]) {
  const state = { calls: 0 };
  const auth = {
    api: {
      async getSession() {
        const b = seq[Math.min(state.calls, seq.length - 1)];
        state.calls++;
        if (b === "transient") throw new Error("Connection terminated unexpectedly");
        if (b === "fatal") throw new Error('column "foo" does not exist');
        return b;
      },
    },
  };
  return { auth: auth as unknown as Parameters<typeof getSessionWithRetry>[0], state };
}

const H = new Headers();

describe("getSessionWithRetry", () => {
  it("retries a transient connection blip, then succeeds", async () => {
    const { auth, state } = fakeAuth(["transient", "transient", { user: { id: "u1" } }]);
    const s = await getSessionWithRetry(auth, H);
    expect(s).toEqual({ user: { id: "u1" } });
    expect(state.calls).toBe(3); // two blips + the success (would be 1 + a throw before the fix)
  });

  it("does NOT retry a non-transient error — surfaces it immediately", async () => {
    const { auth, state } = fakeAuth(["fatal", { user: { id: "u1" } }]);
    await expect(getSessionWithRetry(auth, H)).rejects.toThrow(/does not exist/);
    expect(state.calls).toBe(1); // no retry on a real error
  });

  it("gives up after exhausting retries (a genuine outage) and throws the last error", async () => {
    const { auth, state } = fakeAuth(["transient", "transient", "transient"]);
    await expect(getSessionWithRetry(auth, H)).rejects.toThrow(/Connection terminated/);
    expect(state.calls).toBe(3);
  });

  it("passes a no-session (null) straight through", async () => {
    const { auth } = fakeAuth([null]);
    expect(await getSessionWithRetry(auth, H)).toBeNull();
  });
});

describe("withDbRetry", () => {
  it("retries an idempotent read past a transient blip, then returns", async () => {
    let calls = 0;
    const out = await withDbRetry(async () => {
      calls++;
      if (calls < 3) throw new Error("Connection terminated unexpectedly");
      return ["pod-a", "pod-b"];
    });
    expect(out).toEqual(["pod-a", "pod-b"]);
    expect(calls).toBe(3);
  });

  it("does not retry a real error", async () => {
    let calls = 0;
    await expect(
      withDbRetry(async () => {
        calls++;
        throw new Error('relation "pods" does not exist');
      }),
    ).rejects.toThrow(/does not exist/);
    expect(calls).toBe(1);
  });
});

describe("isTransientDbError", () => {
  it("matches connection blips, including a wrapped cause", () => {
    expect(isTransientDbError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isTransientDbError(new Error("read ECONNRESET"))).toBe(true);
    expect(
      isTransientDbError(
        new Error("Failed to get session", {
          cause: new Error("terminating connection due to administrator command"),
        }),
      ),
    ).toBe(true);
  });

  it("rejects real (non-connection) errors", () => {
    expect(isTransientDbError(new Error('column "foo" does not exist'))).toBe(false);
    expect(isTransientDbError(new Error("invalid input syntax for type uuid"))).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
  });
});
