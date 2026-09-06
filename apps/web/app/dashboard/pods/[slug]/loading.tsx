import DashboardPage from "@/components/dashboard-page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant skeleton for the pod cockpit. The page is an async server component that awaits a live
 * provider reconcile + several data calls before rendering (see page.tsx), so WITHOUT this the
 * previous page stayed frozen on screen for seconds after a click — the "feels ignored" complaint.
 *
 * Deliberately NEUTRAL: the page renders one of two very different layouts — the SETUP wizard
 * (progress stepper + a single "Building your machine" card, no tabs/preview) for a fresh pod, or the
 * full cockpit (preview + tab row) for a ready one. A skeleton that committed to the cockpit's preview
 * bar + tabs flashed them in and then out the moment a fresh pod resolved to the setup card (owner
 * report, 2026-09-01). So show only what BOTH share: the header + one framed content block.
 */
export default function Loading() {
  return (
    <DashboardPage backHref="/dashboard" backLabel="Dashboard">
      {/* Header: status dot + pod name + a status chip */}
      <div className="flex items-center gap-3">
        <Skeleton className="size-2.5 rounded-full" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-20 rounded-md" />
      </div>

      {/* One neutral framed block — stands in for the setup card OR the first cockpit block, without
          committing to tabs/a preview the setup wizard doesn't have. */}
      <div className="rounded-2xl border border-border p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-4 w-full max-w-md" />
        <Skeleton className="mt-2 h-4 w-3/4 max-w-sm" />
      </div>
    </DashboardPage>
  );
}
