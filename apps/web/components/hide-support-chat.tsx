"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Hide the PostHog Support (Conversations) launcher bubble while mounted — the web
 * terminal is full-bleed and the floating bubble sat on top of it. PostHog injects the
 * launcher itself, so there's no component to gate; we hide it two ways and restore on
 * unmount so it comes back everywhere else:
 *   1. the SDK's own hide, if this build exposes it (the clean path);
 *   2. a scoped <style> backstop keyed on a body class, for builds/widget versions where
 *      no hide() exists. The selector targets PostHog's injected widget containers only.
 */
const STYLE_ID = "pb-hide-support-chat";
const BODY_CLASS = "pb-hide-support-chat";
// Below Tailwind's md — a phone, where the fixed launcher collides with a sticky bottom action.
const MOBILE_MAX = 767;

/**
 * @param mobileOnly hide the launcher only on small screens (a phone, where it overlaps a sticky
 *   bottom button like the wizard's Next), leaving it reachable on desktop. Uses the CSS backstop
 *   wrapped in a media query — NOT the SDK hide(), which is all-viewports.
 */
export default function HideSupportChat({ mobileOnly = false }: { mobileOnly?: boolean }) {
  useEffect(() => {
    const conv = (posthog as unknown as { conversations?: { hide?: () => void; show?: () => void } })
      .conversations;
    // SDK hide() has no viewport scope, so only use it for the full hide.
    if (!mobileOnly) conv?.hide?.();

    const selectors = `
      body.${BODY_CLASS} [class*="PostHogSurvey"],
      body.${BODY_CLASS} [class*="ph-conversations"],
      body.${BODY_CLASS} [class*="posthog-conversation"],
      body.${BODY_CLASS} [id*="ph-support"],
      body.${BODY_CLASS} iframe[title*="PostHog" i] { display: none !important; }`;
    const css = mobileOnly ? `@media (max-width: ${MOBILE_MAX}px) {${selectors}\n}` : selectors;
    // Distinct id per mode so a mobile-only page doesn't inherit a full-hide rule (or vice-versa).
    const styleId = mobileOnly ? `${STYLE_ID}-mobile` : STYLE_ID;
    if (!document.getElementById(styleId)) {
      const el = document.createElement("style");
      el.id = styleId;
      el.textContent = css;
      document.head.appendChild(el);
    }
    document.body.classList.add(BODY_CLASS);

    return () => {
      document.body.classList.remove(BODY_CLASS);
      // The launcher only reappears once the class is gone; re-showing is PostHog's default.
    };
  }, [mobileOnly]);

  return null;
}
