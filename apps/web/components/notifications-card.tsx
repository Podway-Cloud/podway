"use client";

import { useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setReminderEmails } from "@/lib/notification-actions";

/** Settings → Notifications: turn login-expiry reminder EMAILS on or off. */
export function NotificationsCard({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const toggle = () => {
    setBusy(true);
    void setReminderEmails(!on)
      .then(() => setOn(!on))
      .finally(() => setBusy(false));
  };
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start gap-2.5 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border bg-white/[0.04] text-muted-foreground">
          <Bell className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-[15.5px] font-semibold">Notifications</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Emails about your pods</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border/60 px-5 py-3.5">
        <div className="min-w-0">
          <div className="text-sm font-medium">Login reminder emails</div>
          <p className="text-[12.5px] text-muted-foreground">
            Email me 3, 2 and 1 days before an agent login expires, and when it does.{" "}
            {on ? "On" : "Off"} — the dashboard and your agent still remind you either way.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={toggle}
          className={on ? "border-warning/40 text-warning hover:bg-warning/10" : "border-success/40 text-success hover:bg-success/10"}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {on ? "Turn off" : "Turn on"}
        </Button>
      </div>
    </section>
  );
}
