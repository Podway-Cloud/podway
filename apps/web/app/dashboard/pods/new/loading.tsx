import DashboardPage from "@/components/dashboard-page";
import { Skeleton } from "@/components/ui/skeleton";

/** Instant skeleton for the launch/configure page (awaits the env detail before rendering). */
export default function Loading() {
  return (
    <DashboardPage backHref="/dashboard/create" backLabel="Create a pod">
      <Skeleton className="h-7 w-56" />
      {/* Step-label + "1 / N" counter row, like launch-configure's Basics header. */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 w-10" />
      </div>
      {/* Borderless field group — the real form's fields sit in a border-0/bg-transparent card. */}
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>
    </DashboardPage>
  );
}
