import { describe, it, expect } from "vitest";
import { createTestDb, user, reportFingerprints, eq } from "@podway/db";
import { PodReports, fingerprintOf } from "../src/pod-reports.js";

const line = (id: string, summary: string, extra: Record<string, unknown> = {}) => ({
  id, summary, area: "rc", detail: "", source: "auto:rc-start", at: "2026-09-25T12:00:00Z", bundle: { logs: "x" }, ...extra,
});

describe("fingerprintOf — the same bug on different pods/times is one fingerprint", () => {
  it("ignores numbers, hex ids, paths and timestamps", () => {
    const a = fingerprintOf("rc", "Codex RC failed pid 3160 at 2026-09-25T12:00:00Z session_ab12cd34ef /home/dev/x");
    const b = fingerprintOf("rc", "Codex RC failed pid 42 at 2026-10-01T01:02:03Z session_99ffee0011 /tmp/y");
    expect(a).toBe(b);
    expect(fingerprintOf("auth", "Codex RC failed")).not.toBe(fingerprintOf("rc", "Codex RC failed"));
  });
});

describe("PodReports.ingest", () => {
  it("stores each report once, groups by fingerprint, and wakes triage only on NEW / reopened", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(user).values({ id: "o1", name: "Dana", email: "d@x.com" });
      const woke: string[] = [];
      const reports = new PodReports(db, { wakeTriage: async (msg) => void woke.push(msg) });

      await reports.ingest("pod-a", "o1", [line("r1", "Codex RC keeps failing pid 1")]);
      await reports.ingest("pod-b", "o1", [line("r2", "Codex RC keeps failing pid 2")]);
      await reports.ingest("pod-a", "o1", [line("r1", "Codex RC keeps failing pid 1")]); // re-drained line
      const fp = (await db.select().from(reportFingerprints))[0]!;
      expect(fp.count).toBe(2);
      expect(woke).toHaveLength(1);
      expect(woke[0]).toContain("pod-a");

      // Marked fixed → recurs → reopened + triage woken again (the regression signal).
      await db.update(reportFingerprints).set({ status: "fixed" }).where(eq(reportFingerprints.fingerprint, fp.fingerprint));
      await reports.ingest("pod-c", "o1", [line("r3", "Codex RC keeps failing pid 3")]);
      expect(woke).toHaveLength(2);
      expect((await db.select().from(reportFingerprints))[0]!.status).toBe("open");

      // Ignored stays quiet.
      await db.update(reportFingerprints).set({ status: "ignored" }).where(eq(reportFingerprints.fingerprint, fp.fingerprint));
      await reports.ingest("pod-d", "o1", [line("r4", "Codex RC keeps failing pid 4")]);
      expect(woke).toHaveLength(2);

      expect((await reports.forPod("o1", "pod-a")).map((r) => r.summary)).toEqual(["Codex RC keeps failing pid 1"]);
      expect(await reports.forPod("someone-else", "pod-a")).toEqual([]);
    } finally {
      await close();
    }
  });

  it("skips malformed lines instead of dropping the batch", async () => {
    const { db, close } = await createTestDb();
    try {
      await db.insert(user).values({ id: "o1", name: "Dana", email: "d@x.com" });
      const reports = new PodReports(db, { wakeTriage: async () => undefined });
      await reports.ingest("pod-a", "o1", [{ nope: 1 } as never, line("ok", "fine")]);
      expect(await reports.forPod("o1", "pod-a")).toHaveLength(1);
    } finally {
      await close();
    }
  });
});
