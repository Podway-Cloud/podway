"use client";

import { useMemo } from "react";
import ConnectWalkthrough, { type Step } from "@/components/connect-walkthrough";

/**
 * Post-create deep-link walkthrough (deeplink-onboarding): a 2-step COACH-MARK tour that points at
 * the pod's REAL cockpit elements — the preview, then the Open-in-Claude button — instead of a modal
 * that re-rendered the same cards on top of the page (which read as a confusing duplicate of the
 * dashboard, owner report). Reuses ConnectWalkthrough's positioning; the anchors it targets
 * (data-tour="preview" / "continue-in-claude") already exist on the cockpit.
 */
export default function DeeplinkWalkthrough({
  appTitle,
  onDone,
}: {
  /** The catalog app's display title, e.g. "n8n" — for "Your n8n is live". */
  appTitle: string;
  onDone: () => void;
}) {
  // Stable across renders — a fresh array each render would churn ConnectWalkthrough's
  // step memo/effects into an infinite update loop.
  const steps: Step[] = useMemo(
    () => [
      {
        tour: "preview",
        title: `Your ${appTitle} is live`,
        body: `This is your ${appTitle}, running on your own pod. Open it in a new tab — the link is private to you until you choose to share it.`,
      },
      {
        tour: "continue-in-claude",
        title: "Steer it from Claude",
        body: `Open the session and just ask — e.g. "add a health-check endpoint and show me the logs". Your AI admin keeps ${appTitle} updated, backed up, and safe.`,
      },
    ],
    [appTitle],
  );
  return <ConnectWalkthrough steps={steps} onDone={onDone} />;
}
