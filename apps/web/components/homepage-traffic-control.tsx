"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/ui/use-confirm";
import { saveHomepageTraffic } from "@/lib/landing-experiment-admin-actions";
import type { LandingVariant } from "@/lib/landing-experiment-config";

export interface TrafficLanding {
  variant: LandingVariant;
  name: string;
  pitch: string;
  /** Tailwind bg class for the colour swatch (one per landing, told apart by lightness too). */
  swatch: string;
}

interface Props {
  /** Exactly two landings: [control, challenger]. The slider sets the challenger's share. */
  landings: [TrafficLanding, TrafficLanding];
  mode: "split" | "one";
  /** Challenger's live share (0–100) in the saved split. */
  challengerPct: number;
  one: LandingVariant | null;
  period: number;
}

const PRESETS = [10, 30, 50, 70, 90];

/** The ONE homepage control (owner redesign, 2026-10-07): split with a %, or one landing for everyone.
 * Nothing changes until Save; the confirm says what happens to visitors and to the results. */
export default function HomepageTrafficControl({ landings, mode, challengerPct, one, period }: Props) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState(mode);
  const [pct, setPct] = useState(challengerPct);
  const [draftOne, setDraftOne] = useState<LandingVariant>(one ?? landings[1].variant);
  const [control, challenger] = landings;

  const nameOf = (v: LandingVariant) => landings.find((l) => l.variant === v)?.name ?? v;
  const short = (m: string, p: number, o: LandingVariant | null) =>
    m === "one" ? `only ${nameOf(o ?? challenger.variant)}` : `split ${100 - p} / ${p}`;
  const live = short(mode, challengerPct, one);
  const draft = short(draftMode, pct, draftOne);
  const dirty =
    draftMode !== mode || (draftMode === "split" ? pct !== challengerPct : draftOne !== one);

  const reset = () => {
    setDraftMode(mode);
    setPct(challengerPct);
    setDraftOne(one ?? challenger.variant);
    setError(null);
  };

  const save = async () => {
    const effects =
      draftMode === "split"
        ? `New visitors are split ${100 - pct}% ${control.name} / ${pct}% ${challenger.name}. People who already saw a landing keep it. Results period ${period + 1} starts now; period ${period} stays under "Earlier periods".`
        : `Every visitor sees ${nameOf(draftOne)} from now on, including people who saw the other landing. The split pauses; its results stay saved. You can switch back any time.`;
    const ok = await confirm({
      title: "Change homepage traffic?",
      message: `From ${live} → to ${draft}.`,
      warning: effects,
      confirmLabel: "Apply now",
    });
    if (!ok) return;
    setError(null);
    start(async () => {
      try {
        await saveHomepageTraffic(
          draftMode === "split"
            ? { mode: "split", weights: { [control.variant]: 100 - pct, [challenger.variant]: pct } }
            : { mode: "one", variant: draftOne },
        );
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <Tabs value={draftMode} onValueChange={(v) => setDraftMode(v as "split" | "one")}>
        <TabsList>
          <TabsTrigger value="split">Split test</TabsTrigger>
          <TabsTrigger value="one">One landing only</TabsTrigger>
        </TabsList>
      </Tabs>

      {draftMode === "split" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span className={`size-2.5 rounded-sm ${control.swatch}`} />
              {control.name}
              <b className="font-mono text-lg tabular-nums">{100 - pct}%</b>
            </span>
            <span className="flex items-center gap-2">
              <b className="font-mono text-lg tabular-nums">{pct}%</b>
              {challenger.name}
              <span className={`size-2.5 rounded-sm ${challenger.swatch}`} />
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            aria-label={`Share of new visitors who see ${challenger.name}`}
            className="w-full accent-warning"
            data-testid="traffic-slider"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[13px] text-muted-foreground">Quick:</span>
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPct(p)}
                aria-pressed={pct === p}
                className={`h-8 rounded-full border px-3 font-mono text-[13px] ${
                  pct === p
                    ? "border-warning/60 bg-warning/10 text-warning"
                    : "border-border text-foreground hover:bg-white/[0.06]"
                }`}
              >
                {100 - p} / {p}
              </button>
            ))}
          </div>
          <ul className="ml-4 list-disc text-[13px] text-muted-foreground">
            <li>People who already saw a landing keep seeing it. Only new visitors follow the new split.</li>
            <li>Saving starts a new results period, so numbers from different splits never mix.</li>
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Landing everyone sees" className="grid gap-3 sm:grid-cols-2">
            {landings.map((l) => {
              const on = draftOne === l.variant;
              return (
                <button
                  key={l.variant}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDraftOne(l.variant)}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left ${
                    on ? "border-primary bg-primary/10" : "border-border hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <span className={`size-2.5 rounded-sm ${l.swatch}`} />
                    {l.name}
                  </span>
                  <span className="text-[13px] text-muted-foreground">{l.pitch}</span>
                </button>
              );
            })}
          </div>
          <ul className="ml-4 list-disc text-[13px] text-muted-foreground">
            <li>Everyone sees this landing, including people who saw the other one before.</li>
            <li>The split pauses. Its results stay saved. Switch back to &ldquo;Split test&rdquo; any time.</li>
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <span className={`text-[13px] ${dirty ? "text-warning" : "text-muted-foreground"}`}>
          {dirty ? `Not saved: ${live} → ${draft}` : "No unsaved changes."}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!dirty || pending} onClick={reset}>
            Cancel
          </Button>
          <Button disabled={!dirty || pending} onClick={() => void save()}>
            {pending ? "Saving…" : "Save change…"}
          </Button>
        </div>
      </div>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}
