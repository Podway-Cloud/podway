/**
 * The attention marker on a cockpit tab: a small dot AFTER the label.
 *
 * Chosen over a count badge or a warning icon (owner, 2026-09-06) because it is the least that still
 * reads as "look here": it adds no width worth noticing, does not fight the active tab's underline,
 * and matches the leading-dot convention the agent-activity pill already uses. Counts here are
 * almost always 1, so a number would cost width and buy nothing.
 *
 * The colour is the SAME semantic token the POD CARD uses for the same state, so a tab and the card
 * can never disagree. That is `warning` for everything that wants the owner — a requested secret, a
 * sign-in to renew, a health issue, an available update — because the card already renders both
 * "Update available" and "Sign-in expired" in warning amber.
 *
 * An earlier version split these into amber "act" vs sky "news". That distinction existed nowhere
 * else in the UI, and an available update plainly does want a click, so it was never news. `info`
 * stays available for a state that is genuinely passive, but nothing uses it today.
 */
export function TabDot({ tone, label }: { tone: "warning" | "info"; label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      // No margin: TabsTrigger is a flex row with gap-1.5, so an ml here DOUBLED the spacing and
      // the dot floated away from its label (owner, 2026-09-06). Let the gap do it.
      className={`inline-block size-1.5 shrink-0 rounded-full ${
        tone === "warning" ? "bg-warning" : "bg-[var(--enable)]"
      }`}
    />
  );
}
