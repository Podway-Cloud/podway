/**
 * Platform bug reports from pods (openspec: pod-bug-reports) — the control-plane side. The pod-agent
 * already scrubbed and capped each report; here they are stored once (the outbox line id is the key, so
 * a re-drained batch is a no-op), grouped by fingerprint, and a NEW fingerprint — or a "fixed" one that
 * came back — wakes the triage pod. Repeats only bump the count, so twenty pods with the same bug are
 * one report and one triage message.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, podReports, reportFingerprints, sql, type Database } from "@podway/db";

export const REPORTS_OUTBOX = "/home/dev/.podway/reports-outbox.jsonl";

export interface ReportLine {
  id: string;
  summary: string;
  area: string;
  detail: string;
  source: string;
  at?: string;
  bundle: Record<string, unknown>;
}

/** Area + the summary with the volatile parts (numbers, hex ids, paths, timestamps) normalized. */
export function fingerprintOf(area: string, summary: string): string {
  const norm = summary
    .toLowerCase()
    .replace(/\d{4}-\d{2}-\d{2}t[\d:.]+z?/g, "<t>")
    .replace(/(?:\/[\w.-]+)+/g, "<path>")
    .replace(/\b[\w-]*[0-9a-f]{8,}\b/g, "<id>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(`${area}|${norm}`).digest("hex").slice(0, 24);
}

function isLine(x: unknown): x is ReportLine {
  const o = x as Record<string, unknown>;
  return !!o && typeof o.id === "string" && typeof o.summary === "string" && typeof o.area === "string" && typeof o.source === "string";
}

export class PodReports {
  constructor(
    private readonly db: Database,
    private readonly deps: { wakeTriage: (message: string) => Promise<void> },
  ) {}

  async ingest(podId: string, ownerId: string, lines: unknown[]): Promise<void> {
    for (const raw of lines) {
      if (!isLine(raw)) continue; // one malformed line must not drop the batch
      const fp = fingerprintOf(raw.area, raw.summary);
      const inserted = await this.db
        .insert(podReports)
        .values({
          id: raw.id,
          podId,
          ownerId,
          fingerprint: fp,
          area: raw.area,
          summary: raw.summary,
          detail: raw.detail ?? "",
          source: raw.source,
          bundle: raw.bundle ?? {},
        })
        .onConflictDoNothing()
        .returning({ id: podReports.id });
      if (inserted.length === 0) continue; // already stored (a re-drained line)

      const prev = (await this.db.select().from(reportFingerprints).where(eq(reportFingerprints.fingerprint, fp)))[0];
      let wake = false;
      if (!prev) {
        await this.db.insert(reportFingerprints).values({ fingerprint: fp, area: raw.area, summary: raw.summary }).onConflictDoNothing();
        wake = true;
      } else {
        const reopened = prev.status === "fixed";
        await this.db
          .update(reportFingerprints)
          .set({ count: sql`${reportFingerprints.count} + 1`, lastSeen: new Date(), ...(reopened ? { status: "open" } : {}) })
          .where(eq(reportFingerprints.fingerprint, fp));
        wake = reopened;
      }
      if (wake) {
        await this.deps
          .wakeTriage(
            `🐞 ${prev ? "REOPENED" : "New"} platform bug report [${raw.area}] from pod ${podId} (${raw.source}): ${raw.summary}\n` +
              (raw.detail ? `Detail: ${raw.detail.slice(0, 500)}\n` : "") +
              `Report id ${raw.id}, fingerprint ${fp}. Pull the bundle (pod_reports), find the root cause, fix; then mark the fingerprint fixed.`,
          )
          .catch(() => undefined);
      }
    }
  }

  /** The owner's view: reports filed from one of THEIR pods, newest first, with the group's status. */
  async forPod(ownerId: string, podId: string) {
    return this.db
      .select({
        id: podReports.id,
        summary: podReports.summary,
        area: podReports.area,
        source: podReports.source,
        createdAt: podReports.createdAt,
        status: reportFingerprints.status,
      })
      .from(podReports)
      .leftJoin(reportFingerprints, eq(podReports.fingerprint, reportFingerprints.fingerprint))
      .where(and(eq(podReports.ownerId, ownerId), eq(podReports.podId, podId)))
      .orderBy(desc(podReports.createdAt))
      .limit(50);
  }
}
