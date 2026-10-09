import Link from "next/link";
import { requireAdmin } from "@/lib/access";
import { loadFunnel, type FunnelRow } from "@/lib/admin-funnel";
import DashboardPage from "@/components/dashboard-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funnel" };

const WINDOWS = [7, 30, 90] as const;

/** One cell: the count, and its share of the row's sign-ups. */
function Step({ n, of }: { n: number; of: number }) {
  return (
    <>
      <span className="tabular-nums">{n}</span>
      {of > 0 && <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">{Math.round((n / of) * 100)}%</span>}
    </>
  );
}

/** The sign-up funnel per first-touch ref, from our own database (every user, no cookies). */
export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin();
  const { days: raw } = await searchParams;
  const days = WINDOWS.find((d) => String(d) === raw) ?? 30;
  const rows: FunnelRow[] = await loadFunnel(days);
  const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
  const td = "px-3 py-2.5 align-middle whitespace-nowrap";
  return (
    <DashboardPage
      title="Sign-up funnel"
      intro={`Accounts created in the last ${days} days, by the link they first came from.`}
      wide
      actions={
        <div className="flex gap-1">
          {WINDOWS.map((d) => (
            <Link
              key={d}
              href={`/admin/funnel?days=${d}`}
              className={`rounded-md px-2.5 py-1 text-[12.5px] ${d === days ? "bg-white/[0.06] text-foreground" : "text-muted-foreground hover:bg-white/[0.06]"}`}
            >
              {d} days
            </Link>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No sign-ups in this window.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table className="w-full border-collapse text-[13px]">
            <thead className="border-b border-border/60 bg-surface-1">
              <tr>
                <th className={th}>Ref</th>
                <th className={`${th} text-right`}>Signed up</th>
                <th className={`${th} text-right`}>Created a pod</th>
                <th className={`${th} text-right`}>Agent signed in</th>
                <th className={`${th} text-right`}>Came back (day 2+)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.ref} className={`border-t border-border/60 ${r.ref === "All" ? "font-semibold" : ""}`}>
                  <td className={`${td} ${r.ref === "All" ? "" : "font-mono text-[12px]"}`}>{r.ref}</td>
                  <td className={`${td} text-right tabular-nums`}>{r.signedUp}</td>
                  <td className={`${td} text-right`}><Step n={r.createdPod} of={r.signedUp} /></td>
                  <td className={`${td} text-right`}><Step n={r.agentIn} of={r.signedUp} /></td>
                  <td className={`${td} text-right`}><Step n={r.cameBack} of={r.signedUp} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">
        Every account counts (our database, no cookies); admins are left out. Each step only counts people who
        also passed the step before. &ldquo;Agent signed in&rdquo; can undercount for pods deleted since.
        &ldquo;Came back&rdquo; = signed in or used a pod 24 h or more after signing up.
      </p>
    </DashboardPage>
  );
}
