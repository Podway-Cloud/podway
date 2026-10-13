import Link from "next/link";
import { requireAdmin } from "@/lib/access";
import { loadRevenue, REV_SHARE, type RevenueRow } from "@/lib/admin-revenue";
import DashboardPage from "@/components/dashboard-page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Revenue" };

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
const td = "px-3 py-2.5 align-middle whitespace-nowrap";

function RevenueTable({ label, rows }: { label: string; rows: RevenueRow[] }) {
  const total = rows.reduce((t, r) => ({ pods: t.pods + r.activePods, paid: t.paid + r.paidPods, rev: t.rev + r.revenueCents, share: t.share + r.shareCents }), { pods: 0, paid: 0, rev: 0, share: 0 });
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full border-collapse text-[13px]">
        <thead className="border-b border-border/60 bg-surface-1">
          <tr>
            <th className={th}>{label}</th>
            <th className={`${th} text-right`}>Active pods</th>
            <th className={`${th} text-right`}>Paying pods</th>
            <th className={`${th} text-right`}>Paid revenue</th>
            <th className={`${th} text-right`}>{Math.round(REV_SHARE * 100)}% share</th>
          </tr>
        </thead>
        <tbody>
          <tr className="font-semibold">
            <td className={td}>All</td>
            <td className={`${td} text-right tabular-nums`}>{total.pods}</td>
            <td className={`${td} text-right tabular-nums`}>{total.paid}</td>
            <td className={`${td} text-right tabular-nums`}>{usd(total.rev)}</td>
            <td className={`${td} text-right tabular-nums`}>{usd(total.share)}</td>
          </tr>
          {rows.map((r) => (
            <tr key={r.app} className="border-t border-border/60">
              <td className={`${td} font-mono text-[12px]`}>{r.app}</td>
              <td className={`${td} text-right tabular-nums`}>{r.activePods}</td>
              <td className={`${td} text-right tabular-nums`}>{r.paidPods}</td>
              <td className={`${td} text-right tabular-nums`}>{usd(r.revenueCents)}</td>
              <td className={`${td} text-right tabular-nums`}>{usd(r.shareCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Monthly revenue by app (app-maker share) and by sign-up ref (creator share) — paid cash only. */
export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdmin();
  const { month: raw } = await searchParams;
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : thisMonth;
  const { byApp, byRef } = await loadRevenue(month);
  const nav = "rounded-md px-2.5 py-1 text-[12.5px] text-muted-foreground hover:bg-white/[0.06]";
  const pct = Math.round(REV_SHARE * 100);
  return (
    <DashboardPage
      title="Revenue"
      intro={`${month} · paid cash per app (app-maker share) and per sign-up ref (creator share), ${pct}% each.`}
      wide
      actions={
        <div className="flex gap-1">
          <Link className={nav} href={`/admin/revenue?month=${shift(month, -1)}`}>← {shift(month, -1)}</Link>
          {month !== thisMonth && <Link className={nav} href={`/admin/revenue?month=${shift(month, 1)}`}>{shift(month, 1)} →</Link>}
        </div>
      }
    >
      <RevenueTable label="App" rows={byApp} />
      <RevenueTable label="Sign-up ref" rows={byRef} />
      <p className="text-[12px] text-muted-foreground">
        Paid revenue = cash collected on paid Stripe invoices this month, per pod. By app = the pod&rsquo;s app; by
        ref = the pod owner&rsquo;s first-touch sign-up ref (e.g. <code>creator-evan</code>). Free pods (early access,
        offers) and amounts paid with credit count as $0. Active pods = pods that existed during the month. Share ={" "}
        {pct}% of paid revenue.
      </p>
    </DashboardPage>
  );
}
