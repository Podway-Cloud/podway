"use client";

import { useEffect } from "react";

const DONE_COOKIE = "pw_signup_sent";

/** One Google Ads `sign_up` event per new account (owner, 2026-10-14). Rendered by the dashboard layout only
 * while the account is minutes old; the cookie stops a repeat on the next pages. */
export default function SignupConversion() {
  useEffect(() => {
    if (document.cookie.includes(`${DONE_COOKIE}=`)) return;
    const w = window as unknown as { gtag?: (...a: unknown[]) => void };
    try {
      w.gtag?.("event", "sign_up", { method: "podway" });
    } catch {
      /* never break the page for a metric */
    }
    document.cookie = `${DONE_COOKIE}=1; path=/; max-age=31536000; SameSite=Lax`;
  }, []);
  return null;
}
