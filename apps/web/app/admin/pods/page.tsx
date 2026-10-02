import Link from "next/link";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/access";
import { POD_TIERS, isPodSize } from "@podway/shared";
import { getFleet, pinnedDigestFor } from "@/lib/fleet";
import { getPodService } from "@/lib/pod-service";
import { listImages } from "@/lib/image-manifest";
import { imageVersionLabel, sameDigest } from "@/lib/pod-image";
import DashboardPage from "@/components/dashboard-page";
import { StatusBadge } from "@/components/pod-status";
import AdminRowUpdate from "@/components/admin-row-update";

export const dynamic = "force-dynamic";

/**
 * Backoffice pods table: which pod needs me, and act on it. One row per pod — size in GB, status, the
 * RAM it holds ON THE BOX (from the box's own numbers, not the guest's), uptime since its last boot,
 * how long its agent has been idle, its real image version, and a forced Update. Suspend / Resize /
 * Destroy stay on the drill-in (/admin/pods/[id]). Box capacity lives on /admin/boxes.
 */

/** A duration as one short unit: 45s, 12m, 5h, 3d. */
function dur(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}
function sizeGb(size: string): number {
  return isPodSize(size) ? POD_TIERS[size].memoryGb : 0;
}
function gb1(mb: number): string {
  return (mb / 1024).toFixed(1);
}

type SortKey = "pod" | "environment" | "size" | "status" | "memory" | "uptime" | "idle" | "version";

export const metadata = { title: "Pods" };

export default async function PodsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const sort = (["pod", "environment", "size", "status", "memory", "uptime", "idle", "version"] as const).includes(
    sp.sort as SortKey,
  )
    ? (sp.sort as SortKey)
    : "pod";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const fleet = await getFleet();
  // Which pods need looking at — the question the per-pod drill-in can't answer,
  // because you have to already know which pod to open. Cached briefly (it reads
  // every running pod), and non-fatal: a sweep failure must not take out the table.
  const attention = await getPodService()
    .adminFleetHealth()
    .catch(() => []);
  // RAM on the box + last boot come from the box itself; versions from the image manifest. Both are
  // best-effort: a box or manifest failure leaves "—", never a broken table.
  const [boxes, images] = await Promise.all([
    getPodService().getBoxStats().catch(() => []),
    listImages().catch(() => []),
  ]);
  const onBox = new Map(boxes.flatMap((b) => b.pods.map((bp) => [bp.id, bp] as const)));
  const now = Date.now();
  const versionOf = (digest: string | null | undefined) => {
    const row = digest ? images.find((i) => sameDigest(i.digest, digest)) : undefined;
    return digest ? imageVersionLabel(row?.version, digest) : "—";
  };
  // Every row's Update goes to its provider's pin; the label names the cloud (Incus) one.
  const pin = pinnedDigestFor("incus");
  const target = pin ? versionOf(pin).replace(/ \(.*\)$/, "") : "the latest image";
  const memMb = (id: string) => onBox.get(id)?.ramUsedMb ?? null;
  const uptimeMs = (id: string) => {
    const t = onBox.get(id)?.startedAt;
    return t ? now - Date.parse(t) : null;
  };
  const idleMs = (p: (typeof fleet.pods)[number]) =>
    p.pod.status === "running" && p.pod.lastActiveAt ? now - Date.parse(p.pod.lastActiveAt) : null;

  const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
  const td = "px-3 py-2.5 align-middle whitespace-nowrap";

  // Sorted server-side via ?sort=&dir= — no client state, and a sorted view is a
  // shareable URL. Numeric columns compare as numbers; the rest as text.
  const key = (p: (typeof fleet.pods)[number]): string | number => {
    switch (sort) {
      case "environment": return p.pod.environmentName;
      case "size": return sizeGb(p.pod.size);
      case "status": return p.pod.status;
      case "memory": return memMb(p.pod.id) ?? -1;
      case "uptime": return uptimeMs(p.pod.id) ?? -1;
      case "idle": return idleMs(p) ?? -1;
      case "version": return p.machineCount > 1 ? 2 : p.stale ? 1 : 0;
      default: return (p.pod.name?.trim() || p.pod.id).toLowerCase();
    }
  };
  const sorted = [...fleet.pods].sort((a, b) => {
    const ka = key(a), kb = key(b);
    const cmp = typeof ka === "number" && typeof kb === "number" ? ka - kb : String(ka).localeCompare(String(kb));
    return dir === "asc" ? cmp : -cmp;
  });
  /**
   * Every cell links to the pod, filling its own cell — so tapping anywhere in the
   * row navigates.
   *
   * NOT a stretched overlay on the <tr>: `position: relative` on a table row is not
   * a reliable containing block, so the overlay resolved against an outer element
   * and ONE row's link covered the entire table (every tap opened the same pod).
   * It also sat on top of the horizontally-scrolling container and ate touch
   * scrolling on a phone. Both reported live, 2026-07-29.
   *
   * Only the first cell's link is reachable by keyboard — the rest are skipped, so
   * a screen reader/tab user gets ONE target per row instead of eight identical ones.
   */
  const CellLink = ({
    id,
    children,
    first,
    className = "",
  }: {
    id: string;
    children: ReactNode;
    first?: boolean;
    className?: string;
  }) => (
    <Link
      href={`/admin/pods/${id}`}
      tabIndex={first ? undefined : -1}
      aria-hidden={first ? undefined : true}
      className={`-mx-3 -my-2.5 block px-3 py-2.5 ${className}`}
    >
      {children}
    </Link>
  );

  /** A sortable header: clicking the active column flips direction. */
  const SortTh = ({ col, label, right }: { col: SortKey; label: string; right?: boolean }) => (
    <th className={right ? `${th} text-right` : th}>
      <Link
        href={`/admin/pods?sort=${col}&dir=${sort === col && dir === "asc" ? "desc" : "asc"}`}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-sort={sort === col ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <span className={sort === col ? "text-foreground" : "opacity-0"}>
          {dir === "asc" ? "▲" : "▼"}
        </span>
      </Link>
    </th>
  );

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

      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full border-collapse text-[13px]">
          <thead className="border-b border-border/60 bg-surface-1">
            <tr>
              <SortTh col="pod" label="Pod" />
              <SortTh col="environment" label="Environment" />
              <SortTh col="size" label="Size" />
              <SortTh col="status" label="Status" />
              <SortTh col="memory" label="RAM on box" right />
              <SortTh col="uptime" label="Up" right />
              <SortTh col="idle" label="Idle" right />
              <SortTh col="version" label="Version" />
              <th className={th}>
                <span className="sr-only">Update</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.pod.id} className="border-t border-border/60 hover:bg-surface-3">
                <td className={td}>
                  <CellLink id={p.pod.id} first className="font-medium hover:underline">
                    {p.pod.name?.trim() || p.pod.id}
                    {p.pod.name?.trim() && (
                      <span className="block font-mono text-[11px] font-normal text-muted-foreground">
                        {p.pod.id}
                      </span>
                    )}
                  </CellLink>
                </td>
                <td className={`${td} text-muted-foreground`}>
                  <CellLink id={p.pod.id}>{p.pod.environmentName}</CellLink>
                </td>
                <td className={`${td} text-muted-foreground`}>
                  <CellLink id={p.pod.id}>
                    {isPodSize(p.pod.size) ? POD_TIERS[p.pod.size].label : p.pod.size}{" "}
                    <span className="text-[11px]">· {sizeGb(p.pod.size)} GB</span>
                  </CellLink>
                </td>
                <td className={td}>
                  <CellLink id={p.pod.id}>
                    <StatusBadge status={p.pod.status} />
                  </CellLink>
                </td>
                <td className={`${td} text-right tabular-nums text-muted-foreground`}>
                  <CellLink id={p.pod.id}>
                    {memMb(p.pod.id) != null ? (
                      <>
                        <span className="text-foreground">{gb1(memMb(p.pod.id)!)}</span> / {sizeGb(p.pod.size)} GB
                      </>
                    ) : (
                      "—"
                    )}
                  </CellLink>
                </td>
                <td className={`${td} text-right tabular-nums text-muted-foreground`}>
                  <CellLink id={p.pod.id}>{dur(uptimeMs(p.pod.id))}</CellLink>
                </td>
                <td className={`${td} text-right tabular-nums text-muted-foreground`}>
                  <CellLink id={p.pod.id}>{dur(idleMs(p))}</CellLink>
                </td>
                <td className={td}>
                  <CellLink id={p.pod.id}>
                    <span className="font-mono text-[12px]">{versionOf(p.pod.imageDigest)}</span>
                    {p.machineCount > 1 ? (
                      <span className="ml-2 text-[11px] text-destructive">{p.machineCount} machines</span>
                    ) : p.stale ? (
                      <span className="ml-2 text-[11px] text-warning">→ {target}</span>
                    ) : null}
                  </CellLink>
                </td>
                <td className={`${td} text-right`}>
                  {p.pod.status === "running" && (
                    <AdminRowUpdate id={p.pod.id} name={p.pod.name?.trim() || p.pod.id} target={target} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[12px] text-muted-foreground">
        Click a pod for details + controls (Suspend, Resize, Rollback, Destroy). RAM on box is what the
        pod&rsquo;s VM holds on the host; Up is time since its last boot; Idle is time since its agent last
        worked. Update moves a pod to the pinned image even when it is current (a reinstall). Box capacity
        lives on <a className="underline" href="/admin/boxes">Boxes</a>.
      </p>
    </DashboardPage>
  );
}
