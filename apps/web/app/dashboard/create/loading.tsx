import DashboardPage from "@/components/dashboard-page";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant skeleton for the create-a-pod catalog. EnvGallery is an async server component that awaits
 * listEnvironments() before the grid appears; without this the prior page stayed frozen. Mirror the
 * tab row (Workspaces / Apps) + a card grid.
 */
export default function Loading() {
  return (
    <DashboardPage
      title="Create a pod"
      intro="Start an open-ended workspace for ongoing development, or launch a self-hosted app your AI admin keeps running for you."
    >
      {/* Tab row — line tabs (Workspaces / Apps), matching env-tabs.tsx (not a pill control) */}
      <div className="mb-1 flex gap-7 border-b border-border/60 pb-2">
        {["w-28", "w-14"].map((w, i) => (
          <Skeleton key={i} className={`h-5 ${w}`} />
        ))}
      </div>
      {/* Card grid */}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <li key={i} className="rounded-xl border border-border p-5">
            <Skeleton className="h-3 w-16" />
            <div className="mt-3 flex items-center gap-2.5">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="mt-3 h-3.5 w-full" />
            <Skeleton className="mt-2 h-3.5 w-3/4" />
            <div className="mt-5 flex justify-end">
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
          </li>
        ))}
      </ul>
    </DashboardPage>
  );
}
