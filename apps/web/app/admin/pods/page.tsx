import Link from "next/link";
import { requireAdmin } from "@/lib/access";
import { getFleet } from "@/lib/fleet";
import { getPodService } from "@/lib/pod-service";
import DashboardPage from "@/components/dashboard-page";
import AdminPodsTable, { POD_SORT_KEYS, type PodSortKey } from "@/components/admin-pods-table";

export const dynamic = "force-dynamic";

/**
 * Backoffice pods table: which pod needs me, and act on it. One row per pod — size in GB, status, the
 * RAM it holds ON THE BOX (from the box's own numbers, not the guest's), uptime since its last boot,
 * how long its agent has been idle, its real image version, and a forced Update. Suspend / Resize /
 * Destroy stay on the drill-in (/admin/pods/[id]). Box capacity lives on /admin/boxes.
 */

export const metadata = { title: "Pods" };

export default async function PodsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const sort: PodSortKey = POD_SORT_KEYS.includes(sp.sort as PodSortKey) ? (sp.sort as PodSortKey) : "pod";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const fleet = await getFleet();
  // Which pods need looking at — the question the per-pod drill-in can't answer,
  // because you have to already know which pod to open. Cached briefly (it reads
  // every running pod), and non-fatal: a sweep failure must not take out the table.
  const attention = await getPodService()
    .adminFleetHealth()
    .catch(() => []);
  return (
    <DashboardPage title="Pods" intro={`${fleet.pods.length} pods`} wide>
      {attention.length > 0 && (
        <section className="mb-4 flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold">
            Needs attention · {attention.length} pod{attention.length === 1 ? "" : "s"}
          </h2>
          {attention.map((row) => (
            <Link
              key={row.id}
              href={`/admin/pods/${row.id}`}
              className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 transition-colors hover:border-primary/50 ${
                row.worst === "critical"
                  ? "border-destructive/45 bg-destructive/[0.06]"
                  : "border-warning/45 bg-warning/[0.06]"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="font-medium">{row.name?.trim() || row.id}</span>
                <span className="font-mono text-[11.5px] text-muted-foreground">{row.id}</span>
                <span className="text-[12px] text-muted-foreground">· {row.environmentName}</span>
              </div>
              {row.issues.map((i) => (
                <span key={i.id} className="text-[12.5px] text-muted-foreground">
                  <span
                    className={
                      i.severity === "critical" ? "text-destructive" : "text-warning"
                    }
                  >
                    {i.severity}
                  </span>{" "}
                  — {i.title}
                </span>
              ))}
            </Link>
          ))}
        </section>
      )}

      {/* Three DIFFERENT conditions with three different remedies. Lumping them into
          one line meant the advice ("open the pod to re-sync") was wrong for an
          orphan — there is no pod page to open, because there is no pod. */}
      {fleet.ghosts.length > 0 && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
          <strong>
            {fleet.ghosts.length} ghost pod{fleet.ghosts.length === 1 ? "" : "s"}
          </strong>{" "}
          — we think they exist, the provider has no machine. The owner sees a working pod that
          can&rsquo;t act. Open each to re-sync (the drill-in reconciles on load):{" "}
          {fleet.ghosts.map((g) => g.pod.id).join(", ")}.
        </p>
      )}

      {fleet.duplicates.length > 0 && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
          <strong>
            {fleet.duplicates.length} duplicated pod{fleet.duplicates.length === 1 ? "" : "s"}
          </strong>{" "}
          — more than one machine, each one billing. Open each to reconcile:{" "}
          {fleet.duplicates.join(", ")}.
        </p>
      )}

      {fleet.orphans.length > 0 && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
          <strong>
            {fleet.orphans.length} orphaned instance{fleet.orphans.length === 1 ? "" : "s"}
          </strong>{" "}
          — running on the box with no pod record. Nothing to open: they are leftover
          infrastructure, removed on the box once you have confirmed they hold nothing:{" "}
          {fleet.orphans.join(", ")}.
        </p>
      )}

      {fleet.providerUnavailable && (
        <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
          Provider unreachable — status and version may be stale.
        </p>
      )}

      <AdminPodsTable pods={fleet.pods} sort={sort} dir={dir} basePath="/admin/pods" />

      <p className="text-[12px] text-muted-foreground">
        Click a pod for details + controls (Suspend, Resize, Rollback, Destroy). RAM on box is what the
        pod&rsquo;s VM holds on the host; Up is time since its last boot; Idle is time since its agent last
        worked. Update moves a pod to the pinned image even when it is current (a reinstall). Box capacity
        lives on <a className="underline" href="/admin/boxes">Boxes</a>.
      </p>
    </DashboardPage>
  );
}
