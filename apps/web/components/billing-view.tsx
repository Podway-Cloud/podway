"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/use-confirm";
import AddCardButton from "@/components/add-card-dialog";
import ReferralLink from "@/components/referral-link";
import { removeCard } from "@/lib/billing-actions";

/** A line item on the "Pods this month" list. */
export interface PodLine {
  slug: string;
  name: string;
  sizeLabel: string;
  usd: number;
}
export interface InvoiceRow {
  id: string;
  number: string | null;
  amountPaidCents: number;
  amountDueCents: number;
  status: string;
  created: number;
  url: string | null;
}
export interface CreditGrantRow {
  id: string;
  cents: number;
  reason: string;
  created: number;
}
export interface CardInfo {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}
export interface ReferralStatus {
  joined: number;
  pending: number;
  earned: number;
  earnedCents: number;
}

export interface BillingViewProps {
  /** True once Stripe is configured (cloud, keys present). When false every tab degrades to the
   * pre-billing "coming soon" placeholder — nothing here throws or calls Stripe. */
  enabled: boolean;
  hasCard: boolean;
  /** OUR credit-ledger balance in cents (the mirror pushed to Stripe's customer balance). */
  creditCents: number;
  /** Advertised signup-credit dollars (single source of truth), shown when billing is off. */
  signupCreditUsd: number;
  lines: PodLine[];
  monthlyTotal: number;
  invoices: InvoiceRow[];
  card: CardInfo | null;
  grants: CreditGrantRow[];
  referral: ReferralStatus;
  /** Unix seconds of the next charge (Stripe subscription period end), or null. */
  nextChargeAt: number | null;
  /** The owner's referral code (their account id). */
  referralCode: string;
}

/** `$4` for whole dollars, `$4.50` otherwise. */
function usd(cents: number): string {
  const d = cents / 100;
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`;
}
function fmtDate(sec: number): string {
  return new Date(sec * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function grantLabel(reason: string): string {
  if (reason === "signup") return "Signup credit";
  if (reason === "referral_referred") return "Referral bonus";
  if (reason.startsWith("referral_referrer:")) return "Referral reward";
  return reason;
}

/**
 * The billing page body — a tabbed layout (Overview · Invoices · Payment method · Referral). Server
 * component fetches the summary + Stripe reads and passes them here; this only presents. The tab
 * strip mirrors the pod cockpit exactly (same `@/components/ui/tabs`, `variant="line"`, trigger
 * markup) so it looks identical. Cloud-only — the page `notFound()`s in OSS before reaching this.
 */
export default function BillingView(props: BillingViewProps) {
  const { enabled, hasCard, creditCents, signupCreditUsd, lines, monthlyTotal, invoices, card, grants, referral, nextChargeAt, referralCode } = props;
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [removing, setRemoving] = useState(false);

  const creditLeft = enabled ? creditCents / 100 : signupCreditUsd;
  const estNextCharge = Math.max(0, monthlyTotal - creditLeft);

  async function onRemoveCard() {
    if (!(await confirm({
      title: "Remove your card?",
      message: "We'll delete the saved card from Stripe. Your pods keep running on any remaining credit; add a card again before it runs out to avoid interruption.",
      confirmLabel: "Remove card",
      destructive: true,
    }))) return;
    setRemoving(true);
    const r = await removeCard();
    setRemoving(false);
    if (r.ok) router.refresh();
  }

  return (
    <>
      {dialog}
      <Tabs defaultValue="overview">
        {/* Sticky tab strip — mirrors the cockpit's line-variant tabs (same primitive, sizing, and
            active-state styling). */}
        <div className="sticky top-0 z-20 mb-4 border-b border-border/60 bg-background">
          <TabsList
            variant="line"
            className="max-w-full justify-start gap-5 overflow-x-auto overflow-y-clip overscroll-x-contain py-1 [-ms-overflow-style:none] [scrollbar-width:none] [touch-action:pan-x] [&::-webkit-scrollbar]:hidden"
          >
            <TabsTrigger value="overview" className="flex-none px-0">Overview</TabsTrigger>
            <TabsTrigger value="invoices" className="flex-none px-0">Invoices</TabsTrigger>
            <TabsTrigger value="payment" className="flex-none px-0">Payment method</TabsTrigger>
            <TabsTrigger value="referral" className="flex-none px-0">Referral</TabsTrigger>
          </TabsList>
        </div>

        {/* ---- Overview ---- */}
        <TabsContent value="overview" className="min-h-[20rem] space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="This month" value={`$${monthlyTotal}`} sub={`${lines.length} pod${lines.length === 1 ? "" : "s"}`} />
            <Tile label="Credit left" value={usd(Math.round(creditLeft * 100))} sub={enabled ? "Applied to invoices" : "Signup credit"} accent />
            <Tile
              label="Next charge"
              value={enabled ? `$${estNextCharge}` : "—"}
              sub={enabled ? (nextChargeAt ? `on ${fmtDate(nextChargeAt)}` : "when credit runs out") : "Set up billing to start"}
            />
          </div>

          {/* Pods this month — real, regardless of billing state. */}
          <Section title="Pods this month" desc="What your pods cost right now. Flat monthly, prorated on the first partial month.">
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

          {/* Credit history — signup + referral grants. */}
          <Section title="Credit history" desc="Free credit we've added to your account.">
            {!enabled ? (
              <p className="py-1 text-[13.5px] text-muted-foreground">Your credit history appears here once billing is live.</p>
            ) : grants.length === 0 ? (
              <p className="py-1 text-[13.5px] text-muted-foreground">No credit yet — add a card to get ${signupCreditUsd} free.</p>
            ) : (
              <ul className="flex flex-col">
                {grants.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 border-t border-border/60 py-2.5 text-[13.5px] first:border-t-0">
                    <span className="min-w-0">
                      <span className="font-medium">{grantLabel(g.reason)}</span>
                      <span className="ml-2 text-muted-foreground">{fmtDate(g.created)}</span>
                    </span>
                    <span className="tabular-nums font-medium text-success">+{usd(g.cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </TabsContent>

        {/* ---- Invoices ---- */}
        <TabsContent value="invoices" className="min-h-[20rem] space-y-4">
          <Section title="Invoices" desc="Your past charges. Each one opens the full receipt from Stripe.">
            {!enabled ? (
              <p className="py-1 text-[13.5px] text-muted-foreground">Invoices appear here once billing is live.</p>
            ) : invoices.length === 0 ? (
              <p className="py-1 text-[13.5px] text-muted-foreground">No invoices yet.</p>
            ) : (
              <ul className="flex flex-col">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 border-t border-border/60 py-2.5 text-[13.5px] first:border-t-0">
                    <span className="min-w-0">
                      {inv.url ? (
                        <a href={inv.url} target="_blank" rel="noreferrer" className="font-medium text-[var(--link-accent)] hover:underline">
                          {inv.number ?? "Invoice"}
                        </a>
                      ) : (
                        <span className="font-medium">{inv.number ?? "Invoice"}</span>
                      )}
                      <span className="ml-2 text-muted-foreground">{fmtDate(inv.created)} · {inv.status}</span>
                    </span>
                    <span className="tabular-nums font-medium">{usd(inv.amountPaidCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </TabsContent>

        {/* ---- Payment method ---- */}
        <TabsContent value="payment" className="min-h-[20rem] space-y-4">
          <Section title="Payment method" desc="The card we charge when your credit runs out.">
            {!enabled ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13.5px] text-muted-foreground">Card management appears here once billing is live.</span>
                <Button variant="outline" size="sm" disabled title="Coming soon">Add card</Button>
              </div>
            ) : hasCard ? (
              <div className="flex items-center justify-between gap-3 py-1">
                <span className="flex min-w-0 items-center gap-2.5">
                  <CreditCard className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 text-[13.5px]">
                    {card ? (
                      <>
                        <span className="font-medium capitalize">{card.brand}</span>
                        <span className="ml-1.5 tabular-nums">•••• {card.last4}</span>
                        <span className="ml-2 text-muted-foreground tabular-nums">
                          exp {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
                        </span>
                      </>
                    ) : (
                      <span className="font-medium">Card on file</span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <AddCardButton hasCard />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={removing}
                    onClick={onRemoveCard}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    {removing ? "Removing…" : "Remove"}
                  </Button>
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-white/[0.02] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium">Add a card — get ${signupCreditUsd} free credit</div>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    The ${signupCreditUsd} activates once your card is saved. We only charge it when your credit runs out.
                  </p>
                </div>
                <div className="shrink-0"><AddCardButton hasCard={false} /></div>
              </div>
            )}
          </Section>
        </TabsContent>

        {/* ---- Referral ---- */}
        <TabsContent value="referral" className="min-h-[20rem] space-y-4">
          <Section title="Refer a friend" desc="Give them $10, get $10 once they keep a paid pod for a month.">
            {!enabled ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13.5px] text-muted-foreground">Your referral link appears here once billing is live.</span>
                <Button variant="outline" size="sm" disabled title="Coming soon">Get link</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                <ReferralLink code={referralCode} />
                <div className="flex flex-col gap-2.5 border-t border-border/60 pt-3.5 text-[13.5px] sm:flex-row sm:items-center sm:gap-6">
                  <StatusStat label="Joined" value={referral.joined} />
                  <StatusStat label="Pending" value={referral.pending} />
                  <StatusStat label="Earned" value={referral.earned} note={referral.earnedCents > 0 ? usd(referral.earnedCents) : undefined} />
                </div>
                <p className="text-[12.5px] text-muted-foreground">
                  <span className="font-medium text-foreground">Joined</span> friends who signed up with your link ·{" "}
                  <span className="font-medium text-foreground">Pending</span> not yet matured to a paid month ·{" "}
                  <span className="font-medium text-foreground">Earned</span> rewards credited to you.
                </p>
              </div>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </>
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
    <div>
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <p className="text-[12.5px] text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function StatusStat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
      {note && <span className="text-[12px] font-medium text-success tabular-nums">{note}</span>}
    </span>
  );
}
