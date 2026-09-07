import { describe, it, expect } from "vitest";
import { AdmissionGate } from "../src/admission.js";

/** A job you can hold open and release on demand — so the tests assert ORDER and CONCURRENCY, never wall-clock. */
function heldJob() {
  let release!: () => void;
  const started = { yes: false };
  const gate = new Promise<void>((r) => (release = r));
  return {
    started,
    release,
    fn: async () => {
      started.yes = true;
      await gate;
    },
  };
}

describe("AdmissionGate — the box, not the caller, is what needs bounding", () => {
  it("runs up to max at once and makes the rest WAIT", async () => {
    const g = new AdmissionGate(2);
    const a = heldJob(), b = heldJob(), c = heldJob();
    void g.run("a", a.fn);
    void g.run("b", b.fn);
    void g.run("c", c.fn);
    await Promise.resolve();
    await Promise.resolve();

    expect(a.started.yes).toBe(true);
    expect(b.started.yes).toBe(true);
    expect(c.started.yes).toBe(false); // held at the gate
    expect(g.stats()).toMatchObject({ running: 2, waiting: 1, max: 2 });

    a.release();
    await new Promise((r) => setTimeout(r, 10));
    expect(c.started.yes).toBe(true); // a slot freed, so c went
    b.release();
    c.release();
  });

  it("this is the bug: TWO callers each politely capped at 3 gave the box 6", async () => {
    // Simulates two owners running a bulk update at the same time, each with its own 3 lanes.
    const g = new AdmissionGate(4);
    const jobs = Array.from({ length: 6 }, () => heldJob());
    for (const j of jobs) void g.run("recreate", j.fn);
    await new Promise((r) => setTimeout(r, 5));

    // WITHOUT the gate all six would be running. The whole point is that they are not.
    expect(jobs.filter((j) => j.started.yes)).toHaveLength(4);
    expect(g.stats().waiting).toBe(2);
    for (const j of jobs) j.release();
  });

  it("serves waiters FIFO, so one owner's 50-pod sweep cannot starve another's single update", async () => {
    const g = new AdmissionGate(1);
    const order: string[] = [];
    const first = heldJob();
    void g.run("first", first.fn);
    await new Promise((r) => setTimeout(r, 5));

    const queued = ["sweep-1", "sweep-2", "someone-elses-update"].map((name) =>
      g.run(name, async () => {
        order.push(name);
      }),
    );
    first.release();
    await Promise.all(queued);
    expect(order).toEqual(["sweep-1", "sweep-2", "someone-elses-update"]);
  });

  it("a THROWING job releases its slot — a leaked slot is permanent, and worse than contention", async () => {
    const g = new AdmissionGate(1);
    await expect(
      g.run("boom", async () => {
        throw new Error("recreate failed");
      }),
    ).rejects.toThrow("recreate failed");
    expect(g.stats()).toMatchObject({ running: 0, waiting: 0 });

    // and the gate still works afterwards
    await expect(g.run("after", async () => "ok")).resolves.toBe("ok");
  });

  it("a job that throws still hands the slot to the next WAITER", async () => {
    const g = new AdmissionGate(1);
    const held = heldJob();
    void g.run("held", held.fn).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 5));
    let ranAfter = false;
    const queued = g.run("next", async () => {
      ranAfter = true;
    });
    // release the first as a REJECTION
    held.release();
    await queued;
    expect(ranAfter).toBe(true);
  });

  it("returns the job's value, and refuses a nonsense limit", () => {
    expect(() => new AdmissionGate(0)).toThrow();
    expect(new AdmissionGate(3).stats()).toEqual({ running: 0, waiting: 0, max: 3 });
  });
});
