"use client";

import { useState } from "react";
import { Loader2, MoonStar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setNightUpdateTz } from "@/lib/notification-actions";

/** Settings → Updates: let idle pods update themselves at night (night-update.ts). */
export function NightUpdateCard({ initial }: { initial: string | null }) {
  const [tz, setTz] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = () => {
    const next = tz ? null : Intl.DateTimeFormat().resolvedOptions().timeZone;
    setBusy(true);
    setError(null);
    void setNightUpdateTz(next)
      .then((r) => (r.error ? setError(r.error) : setTz(next)))
      .finally(() => setBusy(false));
  };
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start gap-2.5 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border bg-white/[0.04] text-muted-foreground">
          <MoonStar className="size-[18px]" />
        </span>
        <div>
          <h2 className="text-[15.5px] font-semibold">Updates</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Keep your pods on the latest version</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border/60 px-5 py-3.5">
        <div className="min-w-0">
          <div className="text-sm font-medium">Update idle pods automatically at night</div>
          <p className="text-[12.5px] text-muted-foreground">
            Between 03:00 and 05:00{tz ? ` (${tz})` : " your time"}, pods whose agent is idle update to the latest
            version, and you get one email. A busy pod is skipped. {tz ? "On" : "Off"}.
          </p>
          {error && <p className="text-[12.5px] text-destructive">{error}</p>}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={toggle}
          className={tz ? "border-warning/40 text-warning hover:bg-warning/10" : "border-success/40 text-success hover:bg-success/10"}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {tz ? "Turn off" : "Turn on"}
        </Button>
      </div>
    </section>
  );
}
