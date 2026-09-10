import Link from "next/link";

/**
 * The account's monthly spend at a glance — the successor to the slot meter. Slots are gone; what an
 * owner cares about now is the flat monthly total. Shows running pods at their size price plus any
 * suspended pods at the flat suspended rate, and links to the billing view.
 */
export default function AccountCostStrip({
  running,
  runningUsd,
  suspended,
  suspendedUsd,
}: {
  running: number;
  runningUsd: number;
  suspended: number;
  suspendedUsd: number;
}) {
  const total = runningUsd + suspendedUsd;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-xl border border-border/60 bg-surface-1 px-3.5 py-2.5">
      <div className="flex items-baseline gap-2 text-[13px]">
        <span className="text-lg font-semibold tabular-nums tracking-tight">${total}</span>
        <span className="text-muted-foreground">/mo</span>
        <span className="text-muted-foreground">·</span>
        <span className="tabular-nums">{running} running</span>
        {suspended > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums text-muted-foreground">
              {suspended} suspended (${suspendedUsd})
            </span>
          </>
        )}
      </div>
      <Link
        href="/dashboard/billing"
        className="text-[12.5px] font-medium text-[var(--link-accent)] hover:underline"
      >
        Billing
      </Link>
    </div>
  );
}
