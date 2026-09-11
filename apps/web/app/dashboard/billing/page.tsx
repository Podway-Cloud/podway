import { notFound } from "next/navigation";
import { requireApprovedUser } from "@/lib/access";
import { getPodService } from "@/lib/pod-service";
import { editionOss } from "@/lib/session";
import DashboardPage from "@/components/dashboard-page";
import BillingView, { type PodLine } from "@/components/billing-view";
import {
  getBillingSummary,
  getInvoices,
  getPaymentMethod,
  getCreditGrants,
  getReferralStatus,
  getNextChargeDate,
} from "@/lib/billing-actions";
import { POD_TIERS, type PodSize } from "@podway/shared/tiers";
import { priceForRamGb, tierForRamGb, SUSPENDED_USD, SIGNUP_CREDIT_USD } from "@/lib/pricing-catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

/**
 * Billing — a TABBED page (Overview · Invoices · Payment method · Referral). This server component
 * fetches the real state (the owner's pods priced by size, plus the Stripe reads when configured)
 * and hands it to the client `BillingView`. Every tab degrades to a "coming soon" placeholder when
 * Stripe isn't configured (`getBillingSummary()` → null). Cloud-only — self-host has no per-pod
 * billing, so we `notFound()` in OSS.
 */
export default async function BillingPage() {
  if (editionOss()) notFound();
  const user = await requireApprovedUser();
  const pods = await getPodService().listPods(user.id);

  const priceOf = (size: PodSize): number => priceForRamGb(POD_TIERS[size]?.memoryGb ?? 0) ?? 0;
  const lines: PodLine[] = pods.map((p) => {
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

  // Real billing state when Stripe is configured; null falls back to the pre-billing placeholders.
  const billing = await getBillingSummary();
  const enabled = billing !== null;
  const [invoices, card, grants, referral, nextChargeAt] = enabled
    ? await Promise.all([getInvoices(), getPaymentMethod(), getCreditGrants(), getReferralStatus(), getNextChargeDate()])
    : [[], null, [], { joined: 0, pending: 0, earned: 0, earnedCents: 0 }, null];

  return (
    <DashboardPage backHref="/dashboard" backLabel="Pods" title="Billing">
      <BillingView
        enabled={enabled}
        hasCard={billing?.hasCard ?? false}
        creditCents={billing?.creditCents ?? 0}
        signupCreditUsd={SIGNUP_CREDIT_USD}
        lines={lines}
        monthlyTotal={monthlyTotal}
        invoices={invoices}
        card={card}
        grants={grants}
        referral={referral}
        nextChargeAt={nextChargeAt}
        referralCode={user.id}
      />
    </DashboardPage>
  );
}
