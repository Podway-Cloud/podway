import DashboardPage from "@/components/dashboard-page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant skeleton for Billing. Without its own loading.tsx the billing route fell back to
 * `/dashboard/loading.tsx` — the PODS skeleton titled "Your pods" — so opening Billing flashed the
 * wrong page while it loaded (velsa, 2026-09-12). This mirrors the billing page's shape instead: the
 * tab strip, the three summary tiles, then a short list.
 */
export default function Loading() {
  return (
    <DashboardPage backHref="/dashboard" backLabel="Pods" title="Billing">
      {/* Tab strip (Overview / Invoices / Payment / Referral) */}
      <div className="flex gap-2 border-b border-border/60 pb-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-md" />
        ))}
      </div>
      {/* Three summary tiles */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border/60 p-4">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      {/* A short list of rows (pods / invoices) */}
      <div className="mt-6 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-t border-border/60 py-3.5 first:border-t-0">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </DashboardPage>
  );
}
