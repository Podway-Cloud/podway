import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import HomepageTrafficControl, { type TrafficLanding } from "@/components/homepage-traffic-control";
import {
  LANDING_VARIANT_META,
  landingPreviewPath,
  type LandingExperimentDefinition,
} from "@/lib/landing-experiment-config";
import type { HomepageTraffic } from "@/lib/homepage-traffic";
import type { ChangeLogEntry, PeriodResult, PeriodRow } from "@/lib/homepage-traffic-report";
import {
  SAFE_CONFIDENCE,
  confidence,
  conversionRate,
  upliftVsControl,
  visitorsNeededFor95,
} from "@/lib/experiment-stats";

const SWATCH = ["bg-primary", "bg-warning"] as const;

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const when = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

function sample(row: PeriodRow) {
  return { visitors: row.visitors, conversions: row.signups };
}

/** One plain-words verdict for a period (control = the first landing). */
function verdict(rows: PeriodRow[], names: string[]): { tone: string; head: string; body: string } {
  const [c, v] = rows;
  if (!c || !v || c.visitors === 0 || v.visitors === 0) {
    return { tone: "text-muted-foreground", head: "Too early.", body: "Both landings need visitors before we can compare them." };
  }
  const up = upliftVsControl(sample(c), sample(v));
  const conf = confidence(sample(c), sample(v));
  if (up === null || conf === null) {
    return { tone: "text-muted-foreground", head: "Too early.", body: "No sign-ups yet on the first landing, so there is nothing to compare against." };
  }
  const leader = up >= 0 ? names[1] : names[0];
  const by = `${Math.abs(up * 100).toFixed(0)}%`;
  if (conf >= SAFE_CONFIDENCE) {
    return { tone: "text-success", head: `${leader} wins.`, body: `It converts ${by} better, ${pct(conf)} sure. You can switch to "One landing only".` };
  }
  const need = visitorsNeededFor95(sample(c), sample(v));
  const more = need ? Math.max(0, need - Math.min(c.visitors, v.visitors)) : null;
  return {
    tone: "text-warning",
    head: "Not decided yet.",
    body: `${leader} leads by ${by}, but we are only ${pct(conf)} sure.${more ? ` About ${more.toLocaleString()} more visitors per landing to reach 95%.` : ""}`,
  };
}

function ResultsTable({ result, names }: { result: PeriodResult; names: string[] }) {
  const [c] = result.rows;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[12.5px] text-muted-foreground">
            <th className="border-b border-border/60 px-2 py-2 font-medium">Landing</th>
            <th className="border-b border-border/60 px-2 py-2 text-right font-medium">Visitors</th>
            <th className="border-b border-border/60 px-2 py-2 text-right font-medium">Sign-ups</th>
            <th className="border-b border-border/60 px-2 py-2 text-right font-medium">Conversion</th>
            <th className="border-b border-border/60 px-2 py-2 text-right font-medium">Created a pod</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => {
            const up = i > 0 && c ? upliftVsControl(sample(c), sample(row)) : null;
            return (
              <tr key={row.variant} data-testid={`result-${row.variant}`}>
                <td className="border-b border-border/60 px-2 py-2.5">
                  <span className={`mr-2 inline-block size-2.5 rounded-sm ${SWATCH[i] ?? "bg-muted"}`} />
                  {names[i]}
                  {i === 0 && <span className="ml-1 text-xs text-muted-foreground">(control)</span>}
                </td>
                <td className="border-b border-border/60 px-2 py-2.5 text-right">{row.visitors.toLocaleString()}</td>
                <td className="border-b border-border/60 px-2 py-2.5 text-right">{row.signups.toLocaleString()}</td>
                <td className="border-b border-border/60 px-2 py-2.5 text-right">
                  {pct(conversionRate(sample(row)))}
                  {up !== null && (
                    <span className={`ml-1.5 text-xs ${up >= 0 ? "text-success" : "text-destructive"}`}>
                      {up >= 0 ? "+" : ""}
                      {(up * 100).toFixed(0)}%
                    </span>
                  )}
                </td>
                <td className="border-b border-border/60 px-2 py-2.5 text-right">{row.pods.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ExperimentsPanel({
  definition,
  traffic,
  results,
  log,
}: {
  definition: LandingExperimentDefinition;
  traffic: HomepageTraffic;
  results: PeriodResult[];
  log: ChangeLogEntry[];
}) {
  const [controlV, challengerV] = definition.variants;
  const landings = [controlV, challengerV].map((variant, i) => ({
    variant,
    name: LANDING_VARIANT_META[variant!].name,
    pitch: LANDING_VARIANT_META[variant!].pitch,
    swatch: SWATCH[i],
  })) as [TrafficLanding, TrafficLanding];
  const names = landings.map((l) => l.name);
  const challengerPct = traffic.weights[challengerV!] ?? 0;
  const liveChallenger = traffic.mode === "one" ? (traffic.one === challengerV ? 100 : 0) : challengerPct;
  const liveLine =
    traffic.mode === "one"
      ? `Only ${LANDING_VARIANT_META[traffic.one!].name} (100%)`
      : `Split test · ${100 - challengerPct}% ${names[0]} · ${challengerPct}% ${names[1]}`;
  const [current, ...earlier] = results;
  const v = current ? verdict(current.rows, names) : null;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="gap-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Who sees podway.io now</p>
          <CardTitle className="flex items-center gap-2.5 text-lg" data-testid="traffic-live">
            <span className="size-2 rounded-full bg-success" />
            {liveLine}
          </CardTitle>
          <p className="text-[13px] text-muted-foreground">
            Since {when(traffic.periodStartedAt)} · results period {traffic.period}
          </p>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="bg-primary" style={{ width: `${100 - liveChallenger}%` }} />
            <div className="bg-warning" style={{ width: `${liveChallenger}%` }} />
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 font-semibold">Change it</p>
          <HomepageTrafficControl
            landings={landings}
            mode={traffic.mode}
            challengerPct={challengerPct}
            one={traffic.one}
            period={traffic.period}
          />
        </CardContent>
      </Card>

      {current && v && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">Results — period {current.period}</CardTitle>
            <span className="text-[12.5px] text-muted-foreground">since {when(current.start)} · conversion = signed in</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ResultsTable result={current} names={names} />
            <p className="rounded-lg border border-border/60 bg-white/[0.02] px-3.5 py-2.5 text-sm" data-testid="traffic-verdict">
              <b className={v.tone}>{v.head}</b> <span className="text-muted-foreground">{v.body}</span>
            </p>
            {earlier.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Earlier periods ({earlier.length})</summary>
                <div className="mt-3 flex flex-col gap-4">
                  {earlier.map((r) => (
                    <div key={r.period} className="flex flex-col gap-1.5">
                      <p className="text-[13px] text-muted-foreground">
                        Period {r.period} · {when(r.start)} – {r.end ? when(r.end) : "now"}
                      </p>
                      <ResultsTable result={r} names={names} />
                    </div>
                  ))}
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Landings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2.5 sm:grid-cols-2">
          {landings.map((l) => (
            <div key={l.variant} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3.5 py-3">
              <span className="flex items-center gap-2">
                <span className={`size-2.5 rounded-sm ${l.swatch}`} />
                {l.name}
              </span>
              <Link href={landingPreviewPath(l.variant)} target="_blank" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                Preview <ExternalLink className="size-3.5" />
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change log</CardTitle>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes yet.</p>
          ) : (
            <ul className="flex flex-col" data-testid="traffic-log">
              {log.map((e, i) => (
                <li key={i} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[150px_100px_minmax(0,1fr)] sm:gap-3 border-t border-border/60 py-2.5 text-[13px] first:border-t-0">
                  <span className="font-mono text-muted-foreground">{when(e.at)}</span>
                  <span className="truncate text-muted-foreground">{e.who}</span>
                  <span>{e.what}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
