import { describe, expect, it, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { PodService } from "../src/index.js";
import { InMemoryPodStore } from "../src/store.js";
import { MockProvider } from "./mock-provider.js";

async function envRoot(name: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-signals-"));
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "podway.yaml"),
    `apiVersion: podway/v0\nname: ${name}\nbase:\n  image: ubuntu:24.04\n`,
  );
  return root;
}

describe("manual dashboard order (setPodOrder)", () => {
  let provider: MockProvider;
  let store: InMemoryPodStore;
  let root: string;

  beforeEach(async () => {
    provider = new MockProvider();
    store = new InMemoryPodStore();
    root = await envRoot("plain");
  });

  it("hand order wins over the default status/recency sort", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const a = await svc.launchPod("u1", "plain", { size: "s" });
    const b = await svc.launchPod("u1", "plain", { size: "s" });
    const c = await svc.launchPod("u1", "plain", { size: "s" });

    await svc.setPodOrder("u1", [c.id, a.id, b.id]);

    const ids = (await svc.listPods("u1")).map((p) => p.id);
    expect(ids).toEqual([c.id, a.id, b.id]);
  });

  it("a NEW pod (never hand-placed) floats above the hand-ordered ones", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const a = await svc.launchPod("u1", "plain", { size: "s" });
    const b = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.setPodOrder("u1", [b.id, a.id]);

    const fresh = await svc.launchPod("u1", "plain", { size: "s" });

    const ids = (await svc.listPods("u1")).map((p) => p.id);
    expect(ids).toEqual([fresh.id, b.id, a.id]);
  });

  it("ignores ids the caller doesn't own — no cross-tenant scramble", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const mine = await svc.launchPod("u1", "plain", { size: "s" });
    const theirs = await svc.launchPod("u2", "plain", { size: "s" });
    const theirsBefore = (await store.get(theirs.id))?.position;

    await svc.setPodOrder("u1", [theirs.id, mine.id]);

    // Unowned id UNTOUCHED. (It has a real position of its own now — every pod is placed at
    // creation — so the assertion is "unchanged", not "still null".)
    expect((await store.get(theirs.id))?.position).toBe(theirsBefore);
    expect((await store.get(mine.id))?.position).toBe(0); // owned ids compact from 0
  });

  // The owner's report (2026-08-27): "the dashboard brings those bluish cards to the top?!?! our
  // dashboard is manually sorted only". Root cause was `position: null` at creation — such a pod
  // sorted ABOVE the manual order AND re-sorted itself by STATUS RANK, so a card physically moved
  // as its pod went Working → Waiting → Idle.
  it("every pod is placed at creation — no pod is ever left unpositioned", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const a = await svc.launchPod("u1", "plain", { size: "s" });
    const b = await svc.launchPod("u1", "plain", { size: "s" });

    expect((await store.get(a.id))?.position).not.toBeNull();
    expect((await store.get(b.id))?.position).not.toBeNull();
    // newest first, and strictly above the older one
    expect((await store.get(b.id))!.position!).toBeLessThan((await store.get(a.id))!.position!);
  });

  it("a placed pod does NOT move when its status changes — manual order is authoritative", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const a = await svc.launchPod("u1", "plain", { size: "s" });
    const b = await svc.launchPod("u1", "plain", { size: "s" });
    const c = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.setPodOrder("u1", [a.id, b.id, c.id]);
    const before = (await svc.listPods("u1")).map((p) => p.id);

    // Drive the middle pod to a different lifecycle status (the old sort ranked `error` FIRST and
    // `suspended` after `running`, so this is exactly the input that used to reshuffle a card).
    await store.update(b.id, { status: "error" });
    await store.update(c.id, { status: "suspended" });

    expect((await svc.listPods("u1")).map((p) => p.id)).toEqual(before);
  });

  it("per-owner positioning: one owner's placements never shift another's", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const mine1 = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.launchPod("u2", "plain", { size: "s" });
    const mine2 = await svc.launchPod("u1", "plain", { size: "s" });

    // u1's newest sits above u1's older one, and u2's pod is nowhere in u1's list.
    expect((await svc.listPods("u1")).map((p) => p.id)).toEqual([mine2.id, mine1.id]);
  });
});

describe("ownerLiveSignals (dashboard card sweep)", () => {
  let provider: MockProvider;
  let store: InMemoryPodStore;
  let root: string;

  beforeEach(async () => {
    provider = new MockProvider();
    store = new InMemoryPodStore();
    root = await envRoot("plain");
  });

  it("carries lifecycle for EVERY pod, and probes only running ones for activity", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const run = await svc.launchPod("u1", "plain", { size: "s" });
    const asleep = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    await svc.sleep("u1", asleep.id);

    provider.agentStatusResult = "busy";
    provider.appListeningResult = true;
    provider.issuesResult = [
      { id: "disk", severity: "critical", title: "Disk almost full", detail: "9.8/10GB", fixable: false },
    ];

    const rows = await svc.ownerLiveSignals("u1");
    const byId = new Map(rows.map((r) => [r.id, r]));
    // Both pods present, each with its lifecycle status — the card reflects a
    // transition on the next poll, not only on a full reload.
    expect(byId.get(run.id)).toMatchObject({ status: "running", agentStatus: "busy", appListening: true });
    expect(byId.get(run.id)!.criticalIssue).toMatchObject({ title: "Disk almost full" });
    // The suspended pod is present (lifecycle only), NOT probed → no live claims.
    expect(byId.get(asleep.id)).toMatchObject({ status: "suspended", agentStatus: null, appListening: null });
  });

  it("advances lastActiveAt to the honest transcript activity (lastActivityMs), even when idle NOW", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const run = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    await store.update(run.id, { lastActiveAt: new Date(Date.now() - 2 * 3600_000).toISOString() });
    provider.agentStatusResult = "idle"; // idle THIS instant…
    provider.lastActivityMsResult = 5_000; // …but the last transcript entry (a tool result) was 5s ago

    await svc.ownerLiveSignals("u1");
    expect(Date.now() - Date.parse((await store.get(run.id))!.lastActiveAt)).toBeLessThan(60_000);
  });

  it("does NOT bump when the transcript shows no recent activity (spinner idleMs is ignored)", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const run = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    const stale = new Date(Date.now() - 8 * 24 * 3600_000).toISOString();
    await store.update(run.id, { lastActiveAt: stale });
    provider.agentStatusResult = "idle";
    provider.idleMsResult = 20_000; // terminal spinner output — MUST be ignored now
    provider.lastActivityMsResult = 8 * 24 * 3600_000; // real last transcript entry: 8 days ago

    await svc.ownerLiveSignals("u1");
    expect((await store.get(run.id))!.lastActiveAt).toBe(stale); // untouched — genuinely idle
  });

  it("old image (no lastActivityMs): READS the agent transcript via exec — bumps + reports that, ignores flickery busy", async () => {
    // No busy-fallback (agentStatus flickers "busy" for an idle agent and pinned idle pods to "now" —
    // the makore.app prod bug). Instead we exec a transcript reader in the pod: an un-updated pod still
    // gets its honest agent time WITHOUT a recreate, driving BOTH the card and the lastActiveAt bump.
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const pod = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    await store.update(pod.id, { lastActiveAt: new Date(Date.now() - 5 * 3600_000).toISOString() });
    provider.lastActivityMsResult = null; // old image: healthz doesn't report it
    provider.agentStatusResult = "busy"; // flicker — must NOT be used as an activity signal
    provider.execStdout = String(5 * 60_000); // the exec reader: newest transcript entry 5 min ago

    const [row] = await svc.ownerLiveSignals("u1");
    expect(row!.agentIdleMs).toBe(5 * 60_000); // card shows the transcript time, not terminal noise
    expect(Date.now() - Date.parse((await store.get(pod.id))!.lastActiveAt)).toBeLessThan(6 * 60_000);
    expect(Date.now() - Date.parse((await store.get(pod.id))!.lastActiveAt)).toBeGreaterThan(4 * 60_000);
  });

  it("old image with NO transcript at all (exec prints -1): leaves lastActiveAt untouched", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const pod = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    const stale = new Date(Date.now() - 5 * 3600_000).toISOString();
    await store.update(pod.id, { lastActiveAt: stale });
    provider.lastActivityMsResult = null;
    provider.agentStatusResult = "busy";
    provider.execStdout = "-1"; // fresh pod / no transcript → no signal

    const [row] = await svc.ownerLiveSignals("u1");
    expect(row!.agentIdleMs).toBeNull();
    expect((await store.get(pod.id))!.lastActiveAt).toBe(stale); // untouched
  });

  it("never moves lastActiveAt BACKWARD (older transcript time can't erase recent activity)", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const run = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    const recent = new Date(Date.now() - 10_000).toISOString();
    await store.update(run.id, { lastActiveAt: recent });
    provider.lastActivityMsResult = 3600_000; // transcript says 1h ago — OLDER than recorded

    await svc.ownerLiveSignals("u1");
    expect((await store.get(run.id))!.lastActiveAt).toBe(recent); // unchanged
  });

  it("degrades to unknown (never a false claim) when neither healthz nor metrics report it", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    provider.agentStatusResult = null;
    provider.appListeningResult = undefined; // old image: healthz field absent
    // metricsAppListening unset → fetchMetrics returns null too

    const [row] = await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(row!.agentStatus).toBeNull();
    expect(row!.appListening).toBeNull(); // unknown — not false
  });

  it("carries codexStatus (activity from the rollout mtime) for a running pod", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const pod = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    provider.codexStatusResult = "busy";

    const [row] = await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(row!.codexStatus).toBe("busy");
    expect(row!.id).toBe(pod.id);
  });

  it("falls back to METRICS app.listening when healthz doesn't report it (old image)", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const pod = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    provider.appListeningResult = undefined; // healthz: absent (old image)
    provider.metricsAppListening.set(pod.id, false); // but /metrics knows nothing's on :3000

    const [row] = await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    // Same source the cockpit preview card uses — so the card gates preview correctly
    // even before the pod updates, and the two never disagree.
    expect(row!.appListening).toBe(false);
  });

  it("a pod that doesn't answer is unreachable, not dropped", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const pod = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    provider.podHealth = async () => {
      throw new Error("connect refused");
    };

    const [row] = await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(row).toMatchObject({ id: pod.id, unreachable: true, appListening: null });
  });

  it("is owner-scoped", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    await svc.launchPod("u1", "plain", { size: "s" });
    const theirs = await svc.launchPod("u2", "plain", { size: "s" });
    await svc.provisionPending();

    const rows = await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(rows.find((r) => r.id === theirs.id)).toBeUndefined();
  });

  // THE STAMPEDE. The per-owner cache alone does not stop it: a miss starts an expensive gather,
  // and while that runs the cache is STILL stale — so the next poll misses too and starts another.
  // The client polls every 3s while a pod is transitioning, which is exactly when probes are
  // slowest, so one slow gather could have ~10 more piled behind it, each re-probing the whole
  // fleet. That is the "feels stuck" the owner reported (2026-09-07).
  it("concurrent callers SHARE one gather instead of each starting their own", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    await svc.launchPod("u1", "plain", { size: "s" });
    await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();

    let probes = 0;
    const slow = provider.podHealth.bind(provider);
    provider.podHealth = async (id: string) => {
      probes++;
      await new Promise((r) => setTimeout(r, 40)); // a gather that is still running
      return slow(id);
    };

    // Five polls fired while the first is still in flight — the shape of a 3s poll against a
    // gather that takes longer than the interval.
    await Promise.all([0, 1, 2, 3, 4].map(() => svc.ownerLiveSignals("u1")));

    // 2 pods x ONE gather. Without single-flight this is 2 x 5.
    expect(probes).toBe(2);
  });

  it("one slow pod does not hold back the others (pool, not barrier)", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const ids: string[] = [];
    // MORE than CONCURRENCY (6), so the old code needed a SECOND round — that is the whole
    // point of the test. provisionPending defaults to limit 5, hence the explicit limit.
    for (let i = 0; i < 8; i++)
      ids.push((await svc.launchPod("u1", "plain", { size: "s", slotCap: Infinity })).id);
    await svc.provisionPending(Date.now(), { limit: 20 });
    expect((await store.list()).filter((p) => p.status === "running")).toHaveLength(8);

    const order: string[] = [];
    const orig = provider.podHealth.bind(provider);
    provider.podHealth = async (id: string) => {
      // The FIRST pod is slow; with a 6-wide barrier it would hold the whole first round, so no
      // pod from the second round could finish before it.
      if (id === ids[0]) await new Promise((r) => setTimeout(r, 80));
      order.push(id);
      return orig(id);
    };

    await svc.ownerLiveSignals("u1");

    // The 7th and 8th pods (second "round" under the old batching) complete BEFORE the slow first.
    expect(order[order.length - 1]).toBe(ids[0]);
    expect(order.indexOf(ids[7]!)).toBeLessThan(order.indexOf(ids[0]!));
  });

  // A pod being recreated is the SLOWEST thing to probe and the least informative: its card
  // already says `updating`. Probing it spent a full timeout to learn what the row knew.
  // The stall fix was measured on a BENCH with a mock provider. That models the mechanism, not real
  // incusd contention — so nothing yet proves it on the box. These timings are that evidence.
  it("records what each sweep actually cost, so prod can be measured instead of guessed", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    await svc.launchPod("u1", "plain", { size: "s" });
    await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();

    expect(svc.liveSignalsTimings().count).toBe(0); // nothing invented before a sweep runs
    await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });

    const t = svc.liveSignalsTimings();
    expect(t.count).toBe(1);
    expect(t.recent[0]).toMatchObject({ pods: 2, probed: 2, breakered: 0 });
    expect(t.recent[0]!.ms).toBeGreaterThanOrEqual(0);
  });

  it("counts the pods the BREAKER saved, which is the whole point of having one", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    provider.podHealth = async () => {
      throw new Error("dead");
    };
    for (let i = 0; i < 5; i++) await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });

    const t = svc.liveSignalsTimings();
    const probedTotal = t.recent.reduce((n, r) => n + r.probed, 0);
    const savedTotal = t.recent.reduce((n, r) => n + r.breakered, 0);
    expect(probedTotal).toBe(3); // tripped after 3
    expect(savedTotal).toBe(2); // the remaining polls cost nothing
  });

  it("keeps a BOUNDED history — instrumentation must never become the leak", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    for (let i = 0; i < 260; i++) await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(svc.liveSignalsTimings().count).toBeLessThanOrEqual(200);
    expect(svc.liveSignalsTimings().recent.length).toBeLessThanOrEqual(20);
  });

  it("a pod mid-update is not probed at all", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const quiet = await svc.launchPod("u1", "plain", { size: "s" });
    const busy = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();
    await store.update(busy.id, { updatingSince: new Date().toISOString() });

    const probed: string[] = [];
    const orig = provider.podHealth.bind(provider);
    provider.podHealth = async (id: string) => {
      probed.push(id);
      return orig(id);
    };

    const rows = await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(probed).toEqual([quiet.id]);

    // It must still get a ROW, flagged updating — skipping the probe is not dropping the pod,
    // and it must NOT be reported unreachable (nothing is wrong with it).
    const row = rows.find((r) => r.id === busy.id);
    expect(row).toMatchObject({ updating: true, unreachable: false });
  });

  // The 30s incus default was added deliberately for the control-plane's own background callers.
  // A DASHBOARD poll is not one of those: 30s of holding a lane open to learn a pod is silent is
  // the exact stall the owner reported.
  it("the dashboard sweep probes with a SHORT budget, not the 30s default", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();

    const seen: ({ timeoutMs?: number } | undefined)[] = [];
    const orig = provider.podHealth.bind(provider);
    provider.podHealth = async (id: string, opts?: { timeoutMs?: number }) => {
      seen.push(opts);
      return orig(id);
    };

    await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.timeoutMs).toBeGreaterThan(0);
    expect(seen[0]?.timeoutMs).toBeLessThanOrEqual(5_000);
  });

  it("a pod that never answers stops being probed (circuit breaker)", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    const pod = await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();

    let probes = 0;
    provider.podHealth = async () => {
      probes++;
      throw new Error("connect refused");
    };

    // Ten polls. The first three trip the breaker; the rest must cost nothing.
    for (let i = 0; i < 10; i++) await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(probes).toBe(3);

    // 5.4: it is reported UNKNOWN throughout — a breaker that serves a stale known-good value
    // through an outage is worse than the slowness this change fixes.
    const [row] = await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(row).toMatchObject({ id: pod.id, unreachable: true, agentStatus: null, appListening: null });
    expect(row!.agents).toEqual([]);
  });

  it("the breaker closes on the first success", async () => {
    const svc = new PodService(provider, store, { environmentsRoot: root });
    await svc.launchPod("u1", "plain", { size: "s" });
    await svc.provisionPending();

    const orig = provider.podHealth.bind(provider);
    let probes = 0;
    let broken = true;
    provider.podHealth = async (id: string) => {
      probes++;
      if (broken) throw new Error("connect refused");
      return orig(id);
    };

    for (let i = 0; i < 5; i++) await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(probes).toBe(3); // tripped

    // The pod comes back. Force the retry window open, and one good answer must fully reset it —
    // not decay the count, or a flaky pod would stay half-tripped forever.
    broken = false;
    (svc as unknown as { liveProbeBreaker: Map<string, { fails: number; retryAt: number }> })
      .liveProbeBreaker.set((await store.list())[0]!.id, { fails: 3, retryAt: 0 });
    await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(probes).toBe(4);

    for (let i = 0; i < 3; i++) await svc.ownerLiveSignals("u1", { maxAgeMs: 0 });
    expect(probes).toBe(7); // probed every time again — breaker fully closed
  });
});
