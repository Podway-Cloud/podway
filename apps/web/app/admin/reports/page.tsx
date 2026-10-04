import { adminListReports } from "@/lib/report-actions";
import { getPodService } from "@/lib/pod-service";
import DashboardPage from "@/components/dashboard-page";
import AdminReportActions from "@/components/admin-report-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bug reports" };

/** Platform bug reports filed by pods (pod-bug-reports), grouped by fingerprint, for triage. "Fixed"
 * reopens itself and wakes triage if the bug comes back; "Ignored" stays quiet. */
const TONE: Record<string, string> = {
  open: "text-warning bg-warning/12",
  fixed: "text-success bg-success/12",
  ignored: "text-muted-foreground bg-muted",
};

function ago(iso: string, now: number): string {
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}

export default async function ReportsPage() {
  const rows = await adminListReports(); // admin-gated inside
  const names = new Map((await getPodService().listAllPods().catch(() => [])).map((p) => [p.id, p.name?.trim() || p.id]));
  const now = Date.now();
  const open = rows.filter((r) => r.status === "open").length;
  return (
    <DashboardPage title="Bug reports" intro={`${open} open · ${rows.length} total`} wide>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No reports yet.</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r) => (
            <li key={r.fingerprint} className="flex flex-wrap items-start justify-between gap-3 border-t border-border/60 py-3.5 first:border-t-0">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TONE[r.status] ?? TONE.ignored}`}>{r.status}</span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{r.area}</span>
                  <span className="text-[11px] text-muted-foreground">
                    ×{r.count} · last {ago(r.lastSeen, now)} · first {ago(r.firstSeen, now)}
                  </span>
                </div>
                <p className="break-words text-[13px]">{r.summary}</p>
                <p className="text-[11.5px] text-muted-foreground">
                  {r.pods.map((p) => names.get(p) ?? p).join(", ") || "—"} ·{" "}
                  <span className="font-mono">{r.fingerprint.slice(0, 12)}</span>
                </p>
              </div>
              <AdminReportActions fingerprint={r.fingerprint} status={r.status} />
            </li>
          ))}
        </ul>
      )}
    </DashboardPage>
  );
}
