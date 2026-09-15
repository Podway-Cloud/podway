/**
 * PostHog session-replay masking — kept in CODE, not a dashboard toggle, because this app's cockpit
 * embeds a live terminal (the owner's source and their conversation with their agent) and the
 * launch/settings panes take secret VALUES. `ph-no-capture` is applied to the terminal and secret
 * inputs at their source; `maskAllInputs` is the backstop for any input added later. This is the
 * SINGLE object the client passes to `posthog.init({ session_recording })`, so a test that asserts on
 * it is asserting what actually ships (see posthog-boundary.test.ts) — not a string in a file.
 */
export const SESSION_REPLAY_CONFIG = {
  maskAllInputs: true,
  maskTextSelector: ".ph-no-capture, .term-wrap, [data-ph-mask]",
} as const;
