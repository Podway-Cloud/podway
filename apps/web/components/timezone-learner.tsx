"use client";

import { useEffect } from "react";
import { learnTimezone } from "@/lib/notification-actions";

/** Tells the server the browser's timezone once per session, for the night auto-update window. */
export default function TimezoneLearner() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("pw_tz_sent")) return;
      sessionStorage.setItem("pw_tz_sent", "1");
    } catch {
      /* storage blocked: send anyway, it's one cheap write */
    }
    void learnTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone).catch(() => undefined);
  }, []);
  return null;
}
