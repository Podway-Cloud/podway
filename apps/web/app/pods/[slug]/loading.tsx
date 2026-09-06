import { Skeleton } from "@/components/ui/skeleton";

/** Instant skeleton for the public pod terminal page (awaits getPod + a reconcile before render). */
export default function Loading() {
  return (
    <div className="flex min-h-[70vh] flex-col gap-3 p-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="flex-1 rounded-lg" />
    </div>
  );
}
