import { describe, it, expect } from "vitest";
import { UsageWatch } from "../src/usage-watch.js";

const MIN = 60_000;
const GB = 1024 ** 3;

/** Feed one sample per 5 min for `minutes`, CPU at `share` of `vcpus`, sending `gbPerHour`. */
function run(w: UsageWatch, pod: string, opts: { minutes: number; share: number; vcpus: number; gbPerHour: number; t0?: number }) {
  const alerts = [];
  let cpuNs = 1e12, tx = 1e9;
  for (let m = 0; m <= opts.minutes; m += 5) {
    if (m > 0) {
      cpuNs += 5 * MIN * 1e6 * opts.vcpus * opts.share;
      tx += (opts.gbPerHour * GB) / 12;
    }
    alerts.push(...w.sample(pod, { t: (opts.t0 ?? 0) + m * MIN, cpuNs, txBytes: tx }, opts.vcpus));
  }
  return alerts;
}

describe("abuse usage watch", () => {
  it("flags sustained near-full CPU after 2h — once, not every sample", () => {
    const a = run(new UsageWatch(), "p1", { minutes: 180, share: 0.97, vcpus: 2, gbPerHour: 0.1 });
    expect(a.filter((x) => x.kind === "cpu")).toHaveLength(1);
    expect(a[0]!.detail).toMatch(/CPU at 97% of 2 vCPU for 2h/);
  });

  it("does not flag a busy-but-normal pod (60% CPU) or a short burst", () => {
    expect(run(new UsageWatch(), "p2", { minutes: 180, share: 0.6, vcpus: 2, gbPerHour: 0.1 })).toHaveLength(0);
    expect(run(new UsageWatch(), "p3", { minutes: 90, share: 1, vcpus: 1, gbPerHour: 0.1 })).toHaveLength(0);
  });

  it("flags heavy egress (> 5 GB in an hour)", () => {
    const a = run(new UsageWatch(), "p4", { minutes: 70, share: 0.1, vcpus: 1, gbPerHour: 8 });
    expect(a.map((x) => x.kind)).toEqual(["egress"]);
  });

  it("a VM restart (counters reset) never yields a bogus alert", () => {
    const w = new UsageWatch();
    run(w, "p5", { minutes: 60, share: 0.2, vcpus: 1, gbPerHour: 0.1 });
    // Counters drop to ~0 after a restart; the next samples must not read a huge negative/positive delta.
    expect(w.sample("p5", { t: 65 * MIN, cpuNs: 1e9, txBytes: 1e6 }, 1)).toHaveLength(0);
    expect(w.sample("p5", { t: 70 * MIN, cpuNs: 2e9, txBytes: 2e6 }, 1)).toHaveLength(0);
  });
});
