import Link from "next/link";
import { POD_TIERS, isPodSize, type BoxStats } from "@podway/shared";
import { requireAdmin } from "@/lib/access";
import { getPodService } from "@/lib/pod-service";
import { boxCapacity, soldMbOf } from "@/lib/box-capacity";
import { listImages } from "@/lib/image-manifest";
import { imageVersionLabel, sameDigest } from "@/lib/pod-image";
import DashboardPage from "@/components/dashboard-page";
import { StatusBadge } from "@/components/pod-status";

export const dynamic = "force-dynamic";

/**
 * Backoffice box console: is the box safe, and can we sell more? Everything is in GB of RAM — the unit
 * pods are sold in. Numbers come from the box itself (podway-mem-pressure publishes MemAvailable, ZFS
 * cache, KSM savings and each VM's resident memory every minute); the capacity model is
 * lib/box-capacity.ts. Without the box's numbers the page says so instead of guessing.
 */

const BOX_USD_PER_MONTH = Number(process.env.PODWAY_BOX_USD_PER_MONTH ?? 160);
const GATE_GB = Number(process.env.PODWAY_BOX_RAM_GB) || null;

function gb(mb: number): string {
  return `${(mb / 1024).toFixed(mb < 10 * 1024 ? 1 : 0)} GB`;
}
function pct(n: number, d: number): number {
  return d > 0 ? Math.min(100, Math.max(0, (n / d) * 100)) : 0;
}
function dur(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "bad" | "ok" }) {
  const color = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : "";
  return (
    <div className="flex flex-col gap-0.5 sm:border-l sm:border-border/60 sm:px-4 sm:first:border-l-0 sm:first:pl-0">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`text-xl font-semibold tabular-nums ${color}`}>{value}</span>
      {sub && <span className="text-[11.5px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

const SEG = {
  pods: "bg-primary",
  other: "bg-muted-foreground/40",
} as const;

async function BoxSection({ box, now }: { box: BoxStats; now: number }) {
  const c = boxCapacity(box, GATE_GB);
  const images = await listImages().catch(() => []);
  const versionOf = (d: string | null | undefined) =>
    d ? imageVersionLabel(images.find((i) => sameDigest(i.digest, d))?.version, d) : "—";
  const recs = new Map((await getPodService().listAllPods().catch(() => [])).map((p) => [p.id, p]));
  const diskPct = pct(box.diskUsedMb, box.diskTotalMb);
  const freeTone = c.freeMb < 12 * 1024 ? "bad" : c.freeMb < 24 * 1024 ? "warn" : undefined;
  const verdictTone = c.verdict === "over" ? "bad" : c.verdict === "tight" ? "warn" : c.verdict === "fits" ? "ok" : undefined;
  const pods = [...box.pods].sort((a, b) => (b.ramUsedMb ?? -1) - (a.ramUsedMb ?? -1));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-[15px] font-semibold">{box.name}</h2>
        <span className="text-[12px] text-muted-foreground">
          {box.cpuCores} CPU threads · {box.pods.length} pods
        </span>
      </div>

      {!box.hostMeasured && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-warning">
          The box is not publishing its memory (podway-mem-pressure). RAM below is Incus&apos;s view, which
          counts pod RAM as cache, so free memory is overstated. Do not sell on it.
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 sm:gap-x-0">
        <Stat label="Free RAM" value={gb(c.freeMb)} sub={`of ${gb(box.ramTotalMb)}`} tone={freeTone} />
        <Stat
          label="Sold"
          value={gb(c.soldMb)}
          sub={`${c.overcommit.toFixed(2)}× box RAM${GATE_GB ? ` · gate ${GATE_GB} GB` : ""}`}
        />
        <Stat
          label={GATE_GB ? `If sold to ${GATE_GB} GB` : "Use per pod"}
          value={c.projectedMb != null ? gb(c.projectedMb) : `${Math.round(c.useRatio * 100)}%`}
          sub={
            c.projectedMb != null
              ? `${c.verdict === "fits" ? "fits" : c.verdict === "tight" ? "tight" : "does not fit"} in ${gb(box.ramTotalMb)} · pods use ${Math.round(c.useRatio * 100)}% of size`
              : "of their size, on average"
          }
          tone={verdictTone}
        />
        <Stat
          label="Disk"
          value={`${Math.round(diskPct)}%`}
          sub={`${gb(box.diskUsedMb)} of ${gb(box.diskTotalMb)}`}
          tone={diskPct > 85 ? "bad" : diskPct > 70 ? "warn" : undefined}
        />
      </div>

      {/* Where the RAM is: pods (net of KSM) · ZFS cache + host · free. */}
      <div className="flex flex-col gap-2">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-3">
          <div className={SEG.pods} style={{ width: `${pct(c.podsMb, box.ramTotalMb)}%` }} title={`pods · ${gb(c.podsMb)}`} />
          <div className={SEG.other} style={{ width: `${pct(c.otherMb, box.ramTotalMb)}%` }} title={`ZFS cache + host · ${gb(c.otherMb)}`} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${SEG.pods}`} /> Pods {gb(c.podsMb)}
            {box.ksmSavedMb ? ` (KSM saves ${gb(box.ksmSavedMb)})` : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${SEG.other}`} /> ZFS cache {gb(box.cacheMb ?? 0)} + host{" "}
            {gb(Math.max(0, c.otherMb - (box.cacheMb ?? 0)))}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-surface-3" /> Free {gb(c.freeMb)}
          </span>
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          ${BOX_USD_PER_MONTH}/mo box · ${(BOX_USD_PER_MONTH / Math.max(1, c.soldMb / 1024)).toFixed(2)} per sold GB today
          {GATE_GB ? ` · $${(BOX_USD_PER_MONTH / GATE_GB).toFixed(2)} at the gate` : ""} (backoffice-only).
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full border-collapse text-[13px]">
          <thead className="border-b border-border/60 bg-surface-1">
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Pod</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">RAM on box / size</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Share of size</span>
              </th>
              <th className="px-3 py-2 text-right font-medium">Up</th>
              <th className="px-3 py-2 text-right font-medium">Idle</th>
              <th className="px-3 py-2 font-medium">Version</th>
            </tr>
          </thead>
          <tbody>
            {pods.map((p) => {
              const rec = recs.get(p.id);
              const sizeMb = soldMbOf(p);
              const idle = p.status === "running" && rec?.lastActiveAt ? now - Date.parse(rec.lastActiveAt) : null;
              return (
                <tr key={p.id} className="border-t border-border/60 hover:bg-surface-3">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <Link href={`/admin/pods/${p.id}`} className="font-medium hover:underline">
                      {p.name?.trim() || p.id}
                    </Link>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {isPodSize(p.size) ? POD_TIERS[p.size].label : p.size}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums text-muted-foreground">
                    <span className="text-foreground">{p.ramUsedMb != null ? (p.ramUsedMb / 1024).toFixed(1) : "—"}</span> /{" "}
                    {sizeMb / 1024} GB
                  </td>
                  <td className="w-28 px-3 py-2.5">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                      <div
                        className={(p.ramUsedMb ?? 0) > sizeMb * 0.9 ? "h-full bg-warning" : "h-full bg-primary"}
                        style={{ width: `${pct(p.ramUsedMb ?? 0, sizeMb)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {dur(p.startedAt ? now - Date.parse(p.startedAt) : null)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{dur(idle)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[12px] text-muted-foreground">
                    {versionOf(rec?.imageDigest)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export const metadata = { title: "Boxes" };

export default async function BoxesPage() {
  await requireAdmin();
  const boxes = await getPodService().getBoxStats();
  const now = Date.now();

  return (
    <DashboardPage title="Boxes" wide>
      {boxes.length === 0 ? (
        <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12.5px] text-muted-foreground">
          No self-hosted boxes reporting. (Fly has no box concept; only Incus boxes appear here.)
        </p>
      ) : (
        boxes.map((box) =>
          box.reachable ? (
            <BoxSection key={box.name} box={box} now={now} />
          ) : (
            <p
              key={box.name}
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive"
            >
              <strong>{box.name}</strong> is unreachable — host vitals unknown. The box may be down or the
              WireGuard tunnel is broken.
            </p>
          ),
        )
      )}
      <p className="text-[12px] text-muted-foreground">
        Pods = what pod VMs hold on the box, minus pages KSM shares between them. &ldquo;If sold to the
        gate&rdquo; assumes new pods use their size like today&rsquo;s running pods do, plus today&rsquo;s ZFS
        cache and host. Fits = under 85% of box RAM; tight = under 100%. Refresh to update.
      </p>
    </DashboardPage>
  );
}
