import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getDelinquency } from "@/lib/dunning-status";

/**
 * Non-payment warning shown across the dashboard while the account is delinquent. During grace it
 * warns that pods will be suspended in N days; once suspended it says so and how to bring them back.
 * Renders nothing when the account is in good standing (or under OSS / billing-off). Server component
 * — reads the dunning mirror the gateway sweep maintains.
 */
export default async function DelinquencyBanner({ ownerId }: { ownerId: string }) {
  const d = await getDelinquency(ownerId);
  if (!d) return null;

  const amount = `$${(d.amountDueCents / 100).toFixed(2)}`;
  const tone = d.suspended
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : "border-warning/40 bg-warning/10 text-warning";
  const title = d.suspended
    ? "Your pods are suspended for non-payment."
    : `Payment is overdue (${amount}/month).`;
  const detail = d.suspended
    ? "Add a card or enough credit and your pods come right back — your data is safe."
    : `Add a card or credit within ${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"} or your pods will be suspended. Your data stays safe either way.`;

  return (
    <div className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 ${tone}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{detail}</p>
      </div>
      <Link
        href="/dashboard/billing"
        className="shrink-0 self-center rounded-md border border-current px-3 py-1.5 text-[13px] font-medium hover:bg-white/[0.06]"
      >
        Fix billing
      </Link>
    </div>
  );
}
