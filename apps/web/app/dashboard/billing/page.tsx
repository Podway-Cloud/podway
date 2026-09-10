import { notFound } from "next/navigation";
import Link from "next/link";
import { requireApprovedUser } from "@/lib/access";
import { getPodService } from "@/lib/pod-service";
import { editionOss } from "@/lib/session";
import DashboardPage from "@/components/dashboard-page";
import { Button } from "@/components/ui/button";
import { POD_TIERS, type PodSize } from "@podway/shared/tiers";
import { priceForRamGb, tierForRamGb, SUSPENDED_USD, SIGNUP_CREDIT_USD } from "@/lib/pricing-catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

/**
 * Billing shell. The "this month" charges are REAL (the owner's live pods priced by size); the
 * payment method, invoices, and referral are placeholders for Phase 2 (needs the Stripe backend).
 * Cloud-only — self-host has no per-pod billing.
 */
export default async function BillingPage() {
  if (editionOss()) notFound();
  const user = await requireApprovedUser();
  const pods = await getPodService().listPods(user.id);

  const priceOf = (size: PodSize): number => priceForRamGb(POD_TIERS[size]?.memoryGb ?? 0) ?? 0;
  const lines = pods.map((p) => {
    const suspended = p.status === "suspended";
    const ram = POD_TIERS[p.size]?.memoryGb ?? 0;
    return {
      slug: p.id,
      name: p.name?.trim() || p.id,
      sizeLabel: suspended ? "Suspended" : (tierForRamGb(ram)?.name ?? POD_TIERS[p.size]?.label ?? p.size),
      usd: suspended ? SUSPENDED_USD : priceOf(p.size),
    };
  });
  const monthlyTotal = lines.reduce((s, l) => s + l.usd, 0);
  // Placeholder credit — the real ledger arrives with the Stripe integration (Phase 2).
  const creditRemaining = SIGNUP_CREDIT_USD;

  return (
    <DashboardPage backHref="/dashboard" backLabel="Pods" title="Billing">
      <div className="flex flex-col gap-4">
        {/* Summary tiles */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile label="This month" value={`$${monthlyTotal}`} sub={`${pods.length} pod${pods.length === 1 ? "" : "s"}`} />
          <Tile label="Credit left" value={`$${creditRemaining}`} sub="Signup credit" accent />
          <Tile label="Next invoice" value="—" sub="Set up billing to start" />
        </div>

        {/* Payment method — placeholder */}
        <Section title="Payment method" desc="Add a card to keep your pods running past your free credit.">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13.5px] text-muted-foreground">No card on file</span>
            <Button variant="outline" size="sm" disabled title="Coming soon">Add card</Button>
          </div>
        </Section>

        {/* This month's charges — real pods */}
        <Section title="This month" desc="What your pods cost right now. Flat monthly, prorated on the first partial month.">
          {lines.length === 0 ? (
            <p className="py-1 text-[13.5px] text-muted-foreground">
              No pods yet. <Link href="/dashboard/create" className="font-medium text-[var(--link-accent)] hover:underline">Create one</Link> to start.
            </p>
          ) : (
            <ul className="flex flex-col">
              {lines.map((l) => (
                <li key={l.slug} className="flex items-center justify-between gap-3 border-t border-border/60 py-2.5 text-[13.5px] first:border-t-0">
                  <span className="min-w-0">
                    <Link href={`/dashboard/pods/${l.slug}`} className="font-medium hover:underline">{l.name}</Link>
                    <span className="ml-2 text-muted-foreground">{l.sizeLabel}</span>
                  </span>
                  <span className="tabular-nums font-medium">${l.usd}<span className="text-[11px] font-normal text-muted-foreground">/mo</span></span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 border-t border-border py-2.5 text-[14px] font-semibold">
                <span>Total</span>
                <span className="tabular-nums">${monthlyTotal}<span className="text-[11px] font-normal text-muted-foreground">/mo</span></span>
              </li>
            </ul>
          )}
        </Section>

        {/* Referral — placeholder */}
        <Section title="Refer a friend" desc="Give them $10, get $10 once they keep a paid pod for a month.">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13.5px] text-muted-foreground">Your referral link appears here once billing is live.</span>
            <Button variant="outline" size="sm" disabled title="Coming soon">Get link</Button>
          </div>
        </Section>

        <p className="text-[12px] text-muted-foreground">
          Payments and referrals are coming soon. Prices are shown so you can plan; nothing is charged yet.
        </p>
      </div>
    </DashboardPage>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"}`}>
      <div className="text-[12px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight">{value}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <p className="text-[12.5px] text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}
