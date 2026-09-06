"use client";

import { useEffect, useState } from "react";
import { PhaseHeader } from "@/components/phase-header";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Full-page state shown WHILE a pod is updating (or resizing) — it REPLACES the cockpit,
 * because during a transition the only thing that matters is the transition. Terminal, stats,
 * secrets, preview and settings are gone until it finishes (the parent flips back to the
 * cockpit automatically when `updating` clears). Reuses the real backend stages + elapsed.
 */

/** The real provider stages (packages/provider/src/incus/provider.ts), in order, with owner-
 * friendly labels. The backend emits the raw key as `update_stage`; we map it to this list. */
const STAGES: { key: string; label: string; hint?: string }[] = [
  // The control plane emits "handoff" first (it asks the agent to save + pause before any stop). It
  // had NO entry here, so it fell through to index 0 and rendered as "Stopping the pod" with a frozen
  // bar — the "looks stuck" complaint. Naming it (and the bounded graceful-stop wait) makes the wait
  // legible instead of a hang.
  { key: "handoff", label: "Handing off to the agent", hint: "letting it save and pause — up to a minute" },
  { key: "stopping", label: "Stopping the pod", hint: "waiting for a clean shutdown to protect your files — up to a minute" },
  { key: "recreating", label: "Recreating the machine", hint: "new image — your volume is kept" },
  { key: "starting", label: "Starting" },
  { key: "booting", label: "Booting the pod" },
  { key: "restarting agent", label: "Restarting the agent" },
  { key: "waiting for agent", label: "Waiting for the agent", hint: "until it reports ready" },
  { key: "finishing", label: "Finishing up" },
];

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.max(0, sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PodUpdating({
  name,
  slug,
  environmentName,
  agentsLabel,
  kind,
  stage,
  elapsedSec,
  aheadCount = null,
}: {
  name: string | null;
  slug: string;
  environmentName: string;
  agentsLabel: string;
  kind: "update" | "resize" | "queued";
  stage: string | null;
  elapsedSec: number;
  /** Pods still ahead of this one in the batch. Derived at render time, so it can be null. */
  aheadCount?: number | null;
}) {
  const verb = kind === "resize" ? "Resizing" : kind === "queued" ? "Queued" : "Updating";
  // Active stage = the emitted key; unknown/null → treat as the first (we've only just started).
  const activeIdx = Math.max(0, STAGES.findIndex((s) => s.key === stage));
  const pct = Math.min(100, Math.round(((activeIdx + 0.5) / STAGES.length) * 100));

  // QUEUED is a different screen, not a stage of this one: there is no progress to show, because
  // nothing has started. It takes over the cockpit for the same reason an update does — a bulk
  // update recreates pods one at a time, so this pod may wait ~36 minutes in a 24-pod batch, and an
  // owner who starts editing in that window gets cut off mid-change when its turn arrives.
  //
  // Deliberately NO elapsed timer and NO stage list: both would imply work is happening. The honest
  // signal is the queue position, which shrinks as the batch drains.
  if (kind === "queued") {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8">
        <PhaseHeader title={name || slug} label="Queued for update" tone="warning" />
        <p className="font-mono text-[12px] text-muted-foreground/70">
          {environmentName} · {agentsLabel}
        </p>
        <p className="mt-2 text-[13.5px] text-muted-foreground">
          This pod restarts shortly as part of a batch update. Your workspace stays exactly as it is,
          and the cockpit comes back automatically when it&apos;s done.
        </p>
        <Card className="mt-6">
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-warning" aria-hidden />
            <span className="text-[13.5px] text-foreground">
              {aheadCount === null
                ? "Waiting for its turn"
                : aheadCount === 0
                  ? "Starting next"
                  : `About ${aheadCount} pod${aheadCount === 1 ? "" : "s"} ahead`}
            </span>
          </CardContent>
        </Card>
        <p className="mt-4 text-[12.5px] text-muted-foreground/70">
          Controls are paused so a change you make now isn&apos;t interrupted part-way through. The web
          terminal still works if you need the pod before then.
        </p>
      </div>
    );
  }

  // A live seconds tick so the elapsed counter moves even between the parent's poll cycles.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  void tick;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <PhaseHeader title={name || slug} label={verb} tone="warning" />
      <p className="font-mono text-[12px] text-muted-foreground/70">
        {environmentName} · {agentsLabel}
      </p>
      <p className="mt-2 text-[13.5px] text-muted-foreground">
        {kind === "resize" ? "Resizing this pod" : "Updating to a new pod image"}. Your workspace stays
        exactly as it is — the cockpit comes back automatically when it&apos;s done.
      </p>

      <div className="mt-6 mb-1.5 flex items-baseline gap-2.5">
        <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
          {mmss(elapsedSec)}
        </span>
        <span className="text-[12px] text-muted-foreground/70">elapsed · usually ~1–2 min</span>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-warning transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      <Card>
        <CardContent className="py-1">
          <ul className="flex flex-col">
            {STAGES.map((st, i) => {
              const state = i < activeIdx ? "done" : i === activeIdx ? "active" : "pending";
              return (
                <li
                  key={st.key}
                  className="flex items-start gap-3 border-t border-border py-2.5 first:border-t-0"
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
                    {state === "done" ? (
                      <Check className="size-4 text-success" />
                    ) : state === "active" ? (
                      <Loader2 className="size-4 animate-spin text-warning" />
                    ) : (
                      <span className="size-2 rounded-full bg-muted-foreground/25" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-[13.5px] ${state === "pending" ? "text-muted-foreground" : "font-medium"}`}
                    >
                      {st.label}
                    </div>
                    {st.hint && (
                      <div className="text-[12px] text-muted-foreground/70">{st.hint}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
