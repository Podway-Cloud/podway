"use client";

import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AgenticBehavior {
  /** Don't let the agent stop while work is open. FREE: it refuses a stop, it never starts a turn. */
  hold: boolean;
  /** Nudge the pod when it's idle with work waiting. Each nudge is a BILLED agent turn. */
  wake: boolean;
  /** Pick a question's "(Recommended)" first options after ~10 min with no reply (pod-agent autopilot.ts). */
  autopick: boolean;
}

/**
 * The row description, so the CURRENT STATE is readable without opening anything.
 *
 * This is the point of putting state in the row rather than inside the dialog. The mechanism's
 * failure mode is silence: a disarmed hook behaves exactly like an armed one with nothing to block,
 * and on 2026-09-06 it sat switched off for an hour while being reported as working. A switch that
 * reads "on" proves nothing; a description that states what the pod is actually doing does.
 */
export function describeAgenticBehavior(b: AgenticBehavior): ReactNode {
  // Both states, always, as labelled pairs — never a single summary word. An owner checking whether
  // this pod is actually being held needs to read the answer, not infer it, and a row that only
  // reported the interesting case would go quiet in exactly the state worth noticing. "on" is bold so
  // the switched-on features stand out (owner, 2026-10-12).
  const state = (on: boolean) => (on ? <strong className="font-semibold text-foreground">on</strong> : "off");
  return (
    <>
      Relentless: {state(b.hold)} · Wake to work: {state(b.wake)} · Always choose recommended: {state(b.autopick)}
    </>
  );
}


/** Matches SettingRow's `desc` exactly — one settings design across the cockpit. */
const HINT = "mt-0.5 text-[12.5px] text-muted-foreground";
const LABEL = "text-sm font-medium";

/**
 * Accessible switch, matching the one in claude-settings-dialog rather than introducing a second
 * shape for the same control (see `.claude/rules/ui-patterns.md` — reuse before hand-rolling).
 */
function Toggle({
  id,
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <div className={LABEL}>{label}</div>
        {hint && <div className={HINT}>{hint}</div>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50",
          checked ? "bg-primary" : "bg-input",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/**
 * "Agentic behavior" — one settings row, two switches behind a dialog.
 *
 * They are TWO switches because the halves cost differently, and one modal is where that can
 * actually be said: holding a stop is free, waking an idle pod spends a billed agent turn. A single
 * toggle would hide a bill behind what reads as a behaviour setting. They are behind ONE row because
 * this is an infrequent, consequential choice, and two toggles in the settings list would make it
 * look like two everyday ones.
 */
export function AgenticBehaviorDialog({
  value,
  onSave,
  disabled,
}: {
  value: AgenticBehavior;
  onSave: (next: AgenticBehavior) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AgenticBehavior>(value);
  const [saving, setSaving] = useState(false);

  function onOpenChange(next: boolean) {
    // Re-seed from the live value on every open: a dialog that reopens showing an abandoned draft
    // tells the owner their pod is configured a way it is not.
    if (next) setDraft(value);
    setOpen(next);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          Change…
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Agentic behavior</DialogTitle>
          <DialogDescription>
            How much this pod does on its own while you&apos;re away.
          </DialogDescription>
        </DialogHeader>

        <div className="py-1">
          <Toggle
            id="agentic-hold"
            checked={draft.hold}
            onChange={(hold) => setDraft((d) => ({ ...d, hold }))}
            label="Relentless"
            hint="Won't stop while there is work to do"
            disabled={saving}
          />
          <Toggle
            id="agentic-wake"
            checked={draft.wake}
            onChange={(wake) => setDraft((d) => ({ ...d, wake }))}
            label="Wake to work"
            hint="After 20 idle minutes, the pod sends “next?” — at most 8 times a day. Never while it waits for you; it pauses after two wakes that changed nothing, until you write."
            disabled={saving}
          />
          <Toggle
            id="agentic-autopick"
            checked={draft.autopick}
            onChange={(autopick) => setDraft((d) => ({ ...d, autopick }))}
            label="Always choose recommended"
            hint="If you don't answer a question within 10 minutes, the pod picks the option Claude marked “(Recommended)”."
            disabled={saving}
          />
          {draft.autopick && (
            <div
              role="note"
              className="mt-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-warning"
            >
              Claude will act on its own suggestions without you. Questions about pushing, deploying, deleting,
              spending or publishing are never auto-answered — but read your pod&apos;s history now and then.
            </div>
          )}

          {/* Only shown for the combination that surprises people. Waking a pod that is not held
              gets you exactly one piece of work: it wakes, does that, and stops — so the wake bought
              almost nothing. Said as a concrete sequence rather than a judgement, because the first
              attempt ("free to stop again straight away… make it stay") assumed the reader already
              knew the mechanism, and the owner rightly could not tell what it meant.
              A note, not a hard dependency: it is a legitimate choice, just rarely the intended one. */}
          {draft.wake && !draft.hold && (
            <div
              role="note"
              className="mt-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12.5px] text-warning"
            >
              The pod will wake, do one thing, then stop. Turn on Relentless so it keeps working.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {/* DEFAULT (blue), matching claude-settings-dialog's Save — the sibling this dialog already
              borrowed its Toggle from. A dialog's primary confirm is blue across the app; `outline`
              is for a row-level mutating action (Update, Add agent, Reconnect). ui-patterns.md only
              described the row case, so following it literally made this the odd one out. */}
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
