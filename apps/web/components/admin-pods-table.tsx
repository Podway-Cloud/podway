import Link from "next/link";
import type { ReactNode } from "react";
import { POD_TIERS, isPodSize } from "@podway/shared";
import { pinnedDigestFor, type Fleet } from "@/lib/fleet";
import { getPodService } from "@/lib/pod-service";
import { listImages } from "@/lib/image-manifest";
import { imageVersionLabel, sameDigest } from "@/lib/pod-image";
import { StatusBadge } from "@/components/pod-status";
import AdminRowUpdate from "@/components/admin-row-update";

type FleetPod = Fleet["pods"][number];

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

export type PodSortKey = "pod" | "environment" | "size" | "status" | "memory" | "uptime" | "idle" | "version";
type SortKey = PodSortKey;
export const POD_SORT_KEYS: readonly PodSortKey[] = ["pod", "environment", "size", "status", "memory", "uptime", "idle", "version"];

/**
 * The backoffice pods table (server component), shared by /admin/pods (every pod) and /admin/users/[id]
 * (one owner's pods). Sorted server-side via ?sort=&dir= on `basePath`.
 */
export default async function AdminPodsTable({
  pods,
  sort,
  dir,
  basePath,
}: {
  pods: FleetPod[];
  sort: PodSortKey;
  dir: "asc" | "desc";
  basePath: string;
}) {
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
  const idleMs = (p: FleetPod) =>
    p.pod.status === "running" && p.pod.lastActiveAt ? now - Date.parse(p.pod.lastActiveAt) : null;

  const th = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
  const td = "px-3 py-2.5 align-middle whitespace-nowrap";

  // Sorted server-side via ?sort=&dir= — no client state, and a sorted view is a
  // shareable URL. Numeric columns compare as numbers; the rest as text.
  const key = (p: FleetPod): string | number => {
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
  const sorted = [...pods].sort((a, b) => {
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
        href={`${basePath}${basePath.includes("?") ? "&" : "?"}sort=${col}&dir=${sort === col && dir === "asc" ? "desc" : "asc"}`}
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
  );
}
