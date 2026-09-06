import DashboardPage from "@/components/dashboard-page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant skeleton for the pods dashboard. The page awaits listPods + slot usage + a per-env detail
 * fan-out before rendering, so the "← Dashboard" back-link (and the sidebar "Pods" link) previously
 * showed nothing until all of that resolved. A card grid placeholder gives immediate feedback.
 */
export default function Loading() {
  return (
    <DashboardPage title="Your pods">
      <ul className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Skeleton className="size-2.5 rounded-full" />
                <Skeleton className="h-5 w-28" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-3.5 w-40" />
            <div className="mt-5 flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </li>
        ))}
      </ul>
    </DashboardPage>
  );
}
