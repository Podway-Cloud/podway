import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/access";
import { editionOss } from "@/lib/session";
import DashboardPage from "@/components/dashboard-page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AdminGrantCredit from "@/components/admin-grant-credit";
import { getUserBilling, creditGrantEnabled } from "@/lib/admin-billing";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: id };
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
function when(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
/** Turn a grant reason into human text ("signup", "referral", "admin grant"). */
function grantLabel(reason: string): string {
  if (reason === "signup") return "signup credit";
  if (reason === "referral_referred") return "referral (joined)";
  if (reason.startsWith("referral_referrer:")) return "referral (invited a user)";
  if (reason.startsWith("admin:")) return "admin grant";
  return reason;
}

/** Backoffice per-user billing drill-in: credit, card, pods/RAM, invoices, the credit ledger,
 * referral status, and the manual grant-credit control. Cloud-only. */
export default async function AdminUserBillingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  if (editionOss()) notFound();
  const { id } = await params;
  const b = await getUserBilling(id);
  if (!b) notFound();

  const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
  const td = "px-3 py-2.5 align-middle whitespace-nowrap";

  return (
    <DashboardPage
      title={b.name}
      intro={b.email}
      wide
      backHref="/admin/billing"
      backLabel="Billing"
    >
      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Credit balance" value={usd(b.creditCents)} tone={b.creditCents > 0 ? "success" : undefined} />
        <Tile
          label="Card"
          value={b.card ? `${b.card.brand} ····${b.card.last4}` : b.hasCard ? "on file" : "none"}
          sub={b.card ? `exp ${b.card.expMonth}/${b.card.expYear}` : undefined}
        />
        <Tile label="RAM" value={`${b.usedGb} / ${b.capGb} GB`} tone={b.usedGb >= b.capGb ? "warning" : undefined} />
        <Tile label="Lifetime spend" value={usd(b.lifetimeSpendCents)} />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-muted-foreground">
        {b.stripeUrl ? (
          <a className="underline" href={b.stripeUrl} target="_blank" rel="noreferrer">
            Stripe customer ↗
          </a>
        ) : (
          <span>No Stripe customer yet</span>
        )}
        <span>Next charge: {b.nextChargeAt ? when(b.nextChargeAt) : "—"}</span>
        <span>
          Referrals: {b.referral.earned} earned ({usd(b.referral.earnedCents)}), {b.referral.pending} pending
        </span>
      </div>

      {/* Grant credit */}
      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="text-[14px]">Grant credit</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminGrantCredit ownerId={b.id} disabled={!creditGrantEnabled()} />
        </CardContent>
      </Card>

      {/* Pods */}
      <Section title={`Pods (${b.pods.length})`}>
        {b.pods.length === 0 ? (
          <Empty>No pods.</Empty>
        ) : (
          <Table th={th} head={["Pod", "Size", "Status", "RAM"]}>
            {b.pods.map((p) => (
              <tr key={p.id} className="border-t border-border/60">
                <td className={td}>{p.name}</td>
                <td className={td}>{p.size}</td>
                <td className={`${td} text-muted-foreground`}>{p.status}</td>
                <td className={`${td} text-right tabular-nums`}>{p.ramGb} GB</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Invoices */}
      <Section title={`Invoices (${b.invoices.length})`}>
        {b.invoices.length === 0 ? (
          <Empty>No invoices.</Empty>
        ) : (
          <Table th={th} head={["Date", "Number", "Amount", "Paid", "Status", ""]}>
            {b.invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-border/60">
                <td className={`${td} text-muted-foreground`}>{when(inv.created)}</td>
                <td className={td}>{inv.number ?? inv.id}</td>
                <td className={`${td} text-right tabular-nums`}>{usd(inv.amountCents)}</td>
                <td className={`${td} text-right tabular-nums`}>{usd(inv.amountPaidCents)}</td>
                <td className={`${td} text-muted-foreground`}>{inv.status ?? "—"}</td>
                <td className={`${td} text-right`}>
                  {inv.url ? (
                    <a className="text-[12px] underline" href={inv.url} target="_blank" rel="noreferrer">
                      view ↗
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Credit ledger */}
      <Section title={`Credit grants (${b.grants.length})`}>
        {b.grants.length === 0 ? (
          <Empty>No grants.</Empty>
        ) : (
          <Table th={th} head={["Date", "Reason", "Amount"]}>
            {b.grants.map((g) => (
              <tr key={g.id} className="border-t border-border/60">
                <td className={`${td} text-muted-foreground`}>{when(g.created)}</td>
                <td className={td}>{grantLabel(g.reason)}</td>
                <td className={`${td} text-right tabular-nums text-success`}>{usd(g.cents)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </DashboardPage>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "success" | "warning" }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-surface-1 px-3.5 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[16px] font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[11.5px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Table({ th, head, children }: { th: string; head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full border-collapse text-[13px]">
        <thead className="border-b border-border/60 bg-surface-1">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={i === head.length - 1 || h === "Amount" || h === "Paid" || h === "RAM" ? `${th} text-right` : th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-border/60 px-3 py-3 text-[12.5px] text-muted-foreground">{children}</p>;
}
