"use server";

import { PodReports } from "@podway/control-plane";
import { createAppDb } from "@podway/db";
import { revalidatePath } from "next/cache";
import { requireUser } from "./session";
import { requireAdmin } from "./access";
import { getPodService } from "./pod-service";

export interface PodReportRow {
  id: string;
  summary: string;
  area: string;
  source: string;
  createdAt: string;
  status: string;
}

/** Platform bug reports filed from ONE of the caller's pods (pod-bug-reports) — owner-scoped twice:
 * getPod throws for a pod the caller doesn't own, and the query filters on the owner id. */
export async function getPodReports(slug: string): Promise<PodReportRow[]> {
  const user = await requireUser();
  await getPodService().getPod(user.id, slug);
  const rows = await new PodReports(createAppDb(), { wakeTriage: async () => undefined }).forPod(user.id, slug);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), status: r.status ?? "open" }));
}

export interface AdminReportRow {
  fingerprint: string;
  area: string;
  summary: string;
  count: number;
  status: string;
  firstSeen: string;
  lastSeen: string;
  pods: string[];
}

/** ADMIN: every bug-report fingerprint for triage. */
export async function adminListReports(): Promise<AdminReportRow[]> {
  await requireAdmin();
  const rows = await new PodReports(createAppDb(), { wakeTriage: async () => undefined }).listAll();
  return rows.map((r) => ({ ...r, firstSeen: r.firstSeen.toISOString(), lastSeen: r.lastSeen.toISOString() }));
}

/** ADMIN: mark a report fixed / ignored / open (was a hand-written DB write until 2026-10-04). */
export async function adminSetReportStatus(
  fingerprint: string,
  status: "open" | "fixed" | "ignored",
): Promise<{ error: string } | void> {
  await requireAdmin();
  try {
    await new PodReports(createAppDb(), { wakeTriage: async () => undefined }).setStatus(fingerprint, status);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/admin/reports");
}
