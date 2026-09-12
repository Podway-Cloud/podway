import Link from "next/link";
import { ArrowUpRight, ExternalLink, Info, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ExperimentRunControls,
  PromoteButton,
  SetDefaultButton,
} from "@/components/experiments-panel-controls";
import {
  LANDING_VARIANT_META,
  landingPreviewPath,
  type LandingVariant,
} from "@/lib/landing-experiment-config";
import type { LandingPanelData, LandingPanelVariant } from "@/lib/landing-experiment-store";
import {
  SAFE_CONFIDENCE,
  confidence,
  conversionRate,
  upliftVsControl,
  visitorsNeededFor95,
} from "@/lib/experiment-stats";

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Confidence, capped below 100% — no statistical test is ever "100% confident", and rounding
 * ~0.99998 up to "100.0%" over-claims. Show ">99.9%" instead. */
function confPct(value: number): string {
  return value >= 0.9995 ? ">99.9%" : pct(value);
}

function signedPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

function metricLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function allocationLabel(
  allocation: Readonly<Partial<Record<LandingVariant, number>>>,
): string {
  return Object.entries(allocation)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .map(([variant, percent]) => `${LANDING_VARIANT_META[variant as LandingVariant].name} ${percent}%`)
    .join(" · ");
}

export default function ExperimentsPanel({ data }: { data: LandingPanelData }) {
  const running = data.status === "active";
  const control = data.rows.find((row) => row.isControl) ?? data.rows[0];
  const servedMeta = LANDING_VARIANT_META[data.servedVariant];

  // Leader among measured variants (most conversions per visitor), used for the winner callout.
  const measured = data.rows.filter((row) => row.visitors > 0);
  const leader = measured.reduce<LandingPanelVariant | null>((best, row) => {
    if (!best) return row;
    return conversionRate(row) > conversionRate(best) ? row : best;
  }, null);
  const leaderConfidence =
    leader && control && leader.variant !== control.variant
      ? confidence(control, leader)
      : null;
  const leaderIsSafeWinner =
    leader != null &&
    control != null &&
    leader.variant !== control.variant &&
    conversionRate(leader) > conversionRate(control) &&
    leaderConfidence != null &&
    leaderConfidence >= SAFE_CONFIDENCE;

  return (
    <div className="grid gap-5">
      {/* Zone 1 — live state */}
      <Card>
        <CardContent className="py-4">
          {running ? (
            <p className="text-sm">
              <span className="font-semibold text-success">Experiment running.</span>{" "}
              <span className="text-muted-foreground">
                {allocationLabel(data.allocation)} · goal{" "}
                <span className="text-foreground">{metricLabel(data.primaryMetric)}</span> ·{" "}
                {data.totalVisitors.toLocaleString()} eligible visitors so far.
              </span>
            </p>
          ) : (
            <p className="text-sm">
              <span className="font-semibold text-foreground">
                {servedMeta.name} serves /.
              </span>{" "}
              <span className="text-muted-foreground">
                No experiment is running — all traffic goes to this single default.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Zone 2 — landings */}
      <Card>
        <CardHeader>
          <CardTitle>Landings</CardTitle>
        </CardHeader>
        <CardContent>
          <ul>
            {data.rows.map((row) => {
              const meta = LANDING_VARIANT_META[row.variant];
              const path = landingPreviewPath(row.variant);
              return (
                <li
                  key={row.variant}
                  className="flex flex-wrap items-start justify-between gap-4 border-t border-border/60 py-3.5 first:border-t-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{meta.name}</span>
                      <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {path}
                      </code>
                    </div>
                    <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">{meta.pitch}</p>
                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      {row.visitors.toLocaleString()} visitors ·{" "}
                      {row.visitors > 0 ? pct(conversionRate(row)) : "—"} conversion
                      <span className="ml-1 text-[11px]">(self-canonical)</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <SetDefaultButton variant={row.variant} isDefault={row.isDefault} />
                    <Link
                      href={path}
                      target="_blank"
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] hover:bg-white/[0.06]"
                    >
                      Preview <ExternalLink className="size-3.5" />
                    </Link>
                    <Link
                      href={`/admin/experiments/${data.experimentId}`}
                      title="Landing copy is defined in code; this opens the experiment's frozen definition."
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] hover:bg-white/[0.06]"
                    >
                      Edit <Pencil className="size-3.5" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Zone 3 — experiment */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle>Experiment</CardTitle>
          <ExperimentRunControls running={running} />
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-7 gap-y-3 border-t border-border/60 pt-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[11px] text-muted-foreground">Traffic split</dt>
              <dd className="mt-1">{allocationLabel(data.allocation)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Goal metric</dt>
              <dd className="mt-1">{metricLabel(data.primaryMetric)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Delivery</dt>
              <dd className="mt-1">{data.deliveryMode}</dd>
            </div>
          </dl>
          <p className="mt-3 flex items-start gap-1.5 text-[12px] text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              The split and goal are frozen for statistical validity and the SEO entity signal. To
              change them,{" "}
              <Link
                href={`/admin/experiments/${data.experimentId}`}
                className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2"
              >
                start a new experiment
                <ArrowUpRight className="size-3" />
              </Link>{" "}
              (a new experiment id in config).
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Zone 4 — results */}
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          {leaderIsSafeWinner && leader ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3">
              <p className="text-sm text-success">
                <span className="font-semibold">{LANDING_VARIANT_META[leader.variant].name}</span>{" "}
                wins at {confPct(leaderConfidence!)} confidence ({signedPct(upliftVsControl(control!, leader) ?? 0)}{" "}
                vs {LANDING_VARIANT_META[control!.variant].name}).
              </p>
              <PromoteButton
                variant={leader.variant}
                variantName={LANDING_VARIANT_META[leader.variant].name}
              />
            </div>
          ) : leader && control && leader.variant !== control.variant && conversionRate(leader) > conversionRate(control) ? (
            <p className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-[13px] text-warning">
              {LANDING_VARIANT_META[leader.variant].name} leads
              {" "}({signedPct(upliftVsControl(control, leader) ?? 0)}), but confidence is{" "}
              {leaderConfidence != null ? pct(leaderConfidence) : "—"} — below the 95% bar, so it is
              not a safe call yet.
              {(() => {
                const needed = visitorsNeededFor95(control, leader);
                if (needed == null) return null;
                const more = Math.max(0, needed - Math.min(control.visitors, leader.visitors));
                return more > 0
                  ? ` Needs ~${more.toLocaleString()} more visitors per arm for 95%.`
                  : null;
              })()}
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium">Variant</th>
                  <th className="px-4 py-2 text-right font-medium">Visitors</th>
                  <th className="px-4 py-2 text-right font-medium">Conversions</th>
                  <th className="px-4 py-2 text-right font-medium">Rate</th>
                  <th className="px-4 py-2 text-right font-medium">Uplift</th>
                  <th className="px-4 py-2 text-right font-medium">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const isControlRow = control != null && row.variant === control.variant;
                  const uplift = isControlRow ? null : upliftVsControl(control!, row);
                  const conf = isControlRow ? null : confidence(control!, row);
                  return (
                    <tr className="border-b border-border/60" key={row.variant}>
                      <td className="py-3 pr-4">
                        {LANDING_VARIANT_META[row.variant].name}
                        {isControlRow && (
                          <span className="ml-2 text-[11px] text-muted-foreground">(control)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.visitors.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.conversions.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.visitors > 0 ? pct(conversionRate(row)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {uplift == null ? "—" : (
                          <span className={uplift >= 0 ? "text-success" : "text-destructive"}>
                            {signedPct(uplift)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {conf == null ? "—" : (
                          <span className={conf >= SAFE_CONFIDENCE ? "text-success" : "text-muted-foreground"}>
                            {confPct(conf)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Uplift and confidence are computed against the current default ({servedMeta.name}) with a
            two-proportion z-test. A variant is only called a safe winner at 95% confidence or above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
