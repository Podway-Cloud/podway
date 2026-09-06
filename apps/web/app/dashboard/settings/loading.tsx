import DashboardPage from "@/components/dashboard-page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant skeleton for Settings. The real page is NOT a uniform row list — it's two bordered cards
 * (Relay, GitHub) then an Appearance block, so mirror that shape rather than a divided row list.
 */
export default function Loading() {
  return (
    <DashboardPage title="Settings">
      <div className="space-y-6">
        {/* Relay + GitHub cards */}
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-border/60 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Skeleton className="mt-0.5 size-5 rounded" />
                <div>
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="mt-2 h-3.5 w-64" />
                </div>
              </div>
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
        ))}
        {/* Appearance block */}
        <div className="flex flex-col gap-2.5 border-t border-border/60 pt-5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-3.5 w-72" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      </div>
    </DashboardPage>
  );
}
