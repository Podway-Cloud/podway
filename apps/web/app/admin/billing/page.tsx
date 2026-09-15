import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/access";
import { editionOss } from "@/lib/session";
import { stripeConfigured } from "@podway/control-plane";
import DashboardPage from "@/components/dashboard-page";
import { listBillingOverview, stripeCustomerUrl } from "@/lib/admin-billing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Backoffice billing overview — every user with their credit, card status, pods/RAM, and a flag
 * when the account sits at its RAM ceiling. Cloud-only (self-host has no billing). Built from DB
 * reads only; the per-user drill-in does the live Stripe reads.
 */
export default async function AdminBillingPage() {
  await requireAdmin();
  if (editionOss()) notFound(); // cloud-only operator surface

  const rows = await listBillingOverview();
  const carded = rows.filter((r) => r.hasCard).length;
  const withCredit = rows.filter((r) => r.creditCents > 0).length;
  const stripeOff = !stripeConfigured();

  const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
  const td = "px-3 py-2.5 align-middle whitespace-nowrap";

  return (
    <DashboardPage
      title="Billing"
      intro={`${rows.length} users · ${carded} with a card · ${withCredit} holding credit`}
      wide
    >
      {stripeOff && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
          Stripe is not configured in this environment. Credit + card values show the local mirror;
          granting credit is disabled.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full border-collapse text-[13px]">
          <thead className="border-b border-border/60 bg-surface-1">
            <tr>
              <th className={th}>User</th>
              <th className={`${th} text-right`}>Credit</th>
              <th className={th}>Card</th>
              <th className={`${th} text-right`}>Pods</th>
              <th className={`${th} text-right`}>RAM</th>
              <th className={th}>Stripe</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const stripeUrl = stripeCustomerUrl(r.stripeCustomerId);
              return (
                <tr key={r.id} className="border-t border-border/60">
                  <td className={td}>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11.5px] text-muted-foreground">{r.email}</div>
                  </td>
                  <td className={`${td} text-right tabular-nums ${r.creditCents > 0 ? "text-success" : "text-muted-foreground"}`}>
                    {usd(r.creditCents)}
                  </td>
                  <td className={td}>
                    {r.hasCard ? (
                      <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10.5px] font-medium text-success">
                        on file
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">none</span>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    {r.activePods}
                    {r.totalPods !== r.activePods && (
                      <span className="text-muted-foreground"> / {r.totalPods}</span>
                    )}
                  </td>
                  <td className={`${td} text-right tabular-nums`}>
                    <span className={r.overBudget ? "text-warning" : undefined} title={r.overBudget ? "At the RAM ceiling" : undefined}>
                      {r.usedGb} / {r.capGb} GB
                    </span>
                  </td>
                  <td className={td}>
                    {stripeUrl ? (
                      <a className="text-[12px] underline" href={stripeUrl} target="_blank" rel="noreferrer">
                        open ↗
                      </a>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={`${td} text-right`}>
                    <Link className="text-[12px] underline" href={`/admin/billing/${r.id}`}>
                      details
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Credit + card come from the local billing mirror (fast). RAM is the total of active pods
        against the account budget (16&nbsp;GB free, 64&nbsp;GB with a card). Open a user for
        invoices, the credit ledger, and to grant credit.
      </p>
    </DashboardPage>
  );
}
