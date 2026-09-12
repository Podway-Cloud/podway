"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Power, Square, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/use-confirm";
import {
  promoteWinner,
  setDefaultLanding,
  setExperimentRunning,
  stopExperiment,
} from "@/lib/landing-experiment-admin-actions";

/** Small hook shared by the controls: run a server action, refresh, surface any error. */
function useAction(): {
  pending: boolean;
  error: string | null;
  run: (fn: () => Promise<void>) => void;
} {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    });
  };
  return { pending, error, run };
}

/** Zone 2: per-landing "Set as default" / "Current default". */
export function SetDefaultButton({
  variant,
  isDefault,
}: {
  variant: string;
  isDefault: boolean;
}) {
  const { pending, error, run } = useAction();
  if (isDefault) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-success/12 px-2 py-1 text-[11px] font-semibold text-success">
        <Check className="size-3.5" />
        Current default
      </span>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setDefaultLanding(variant))}
      >
        Set as default
      </Button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}

/** Zone 3: the running on/off toggle + an explicit Stop (keeps the current default). */
export function ExperimentRunControls({ running }: { running: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button
            variant="outline"
            size="sm"
            className="border-warning/40 text-warning hover:bg-warning/10"
            disabled={pending}
            onClick={() => run(() => setExperimentRunning(false))}
          >
            <Power className="size-3.5" />
            Turn off
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="border-sky-400/50 bg-sky-400/[0.06] text-sky-300 hover:bg-sky-400/10"
            disabled={pending}
            onClick={() => run(() => setExperimentRunning(true))}
          >
            <Power className="size-3.5" />
            Turn on
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={pending || !running}
          onClick={() => run(() => stopExperiment())}
        >
          <Square className="size-3.5" />
          Stop experiment
        </Button>
      </div>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}

/** Zone 4: promote a winner (pins it as default AND stops), confirm-before-promote. */
export function PromoteButton({
  variant,
  variantName,
}: {
  variant: string;
  variantName: string;
}) {
  const { pending, error, run } = useAction();
  const { confirm, dialog } = useConfirm();
  return (
    <div className="flex flex-col items-start gap-1">
      {dialog}
      <Button
        variant="outline"
        size="sm"
        className="border-sky-400/50 bg-sky-400/[0.06] text-sky-300 hover:bg-sky-400/10"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const ok = await confirm({
              title: `Promote ${variantName} to default?`,
              message: `${variantName} becomes the landing served at / for everyone.`,
              warning: "This ends the running experiment. Traffic stops splitting immediately.",
              confirmLabel: "Promote & stop",
            });
            if (!ok) return;
            await promoteWinner(variant);
          })
        }
      >
        <Trophy className="size-3.5" />
        Promote to default
      </Button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
