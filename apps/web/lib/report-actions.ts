"use server";

import { PodReports } from "@podway/control-plane";
import { createAppDb } from "@podway/db";
import { requireUser } from "./session";
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
