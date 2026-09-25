"use client";

import { useQuery } from "@tanstack/react-query";
import { getPodReports } from "@/lib/report-actions";

const TONE: Record<string, string> = {
  open: "border-warning/40 bg-warning/10 text-warning",
  fixed: "border-success/40 bg-success/10 text-success",
  ignored: "border-border bg-muted text-muted-foreground",
};

/** Insights → Reports: platform bugs this pod reported to Podway (pod-bug-reports). */
export function PodReportsList({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["pod", slug, "reports"], queryFn: () => getPodReports(slug), refetchInterval: 60_000 });
  if (isLoading) return <p className="text-[13px] text-muted-foreground">Loading reports…</p>;
  if (!data?.length)
    return (
      <p className="text-[13px] text-muted-foreground">
        No bug reports from this pod. When Podway itself misbehaves here, your agent (or the pod) reports it to us
        with diagnostics — secrets removed — and it shows up here.
      </p>
    );
  return (
    <div>
      {data.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-4 border-t border-border/60 py-3.5 first:border-t-0">
          <div className="min-w-0">
            <div className="text-sm font-medium">{r.summary}</div>
            <p className="text-[12.5px] text-muted-foreground">
              {r.area} · {r.source.startsWith("auto:") ? "reported automatically" : "reported by your agent"} ·{" "}
              {new Date(r.createdAt).toLocaleString()}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${TONE[r.status] ?? TONE.open}`}>
            {r.status === "fixed" ? "Fixed" : r.status === "ignored" ? "Closed" : "Open"}
          </span>
        </div>
      ))}
    </div>
  );
}
