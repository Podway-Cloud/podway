"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { sendLandingExperimentEvent } from "@/lib/landing-analytics";

export default function LandingExperimentExposure({ variant }: { variant: string }) {
  useEffect(() => {
    sendLandingExperimentEvent("landing_exposure");
    // Tag PostHog with the landing this visitor saw (owner, 2026-10-07), so funnels and replays can be
    // split by landing. A super property is only SENT with events — which PostHog captures only after
    // cookie consent. No-op when PostHog isn't initialised (no token, self-host).
    try {
      posthog.register({ landing_variant: variant });
    } catch {
      /* posthog not loaded */
    }
  }, [variant]);
  return null;
}
