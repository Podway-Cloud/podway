"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminSetReportStatus } from "@/lib/report-actions";

/** Row actions on /admin/reports. Reversible either way, so no confirm. */
export default function AdminReportActions({ fingerprint, status }: { fingerprint: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const set = (s: "open" | "fixed" | "ignored") =>
    start(async () => {
      setErr(null);
      const r = await adminSetReportStatus(fingerprint, s);
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      {status === "open" ? (
        <>
          <Button variant="outline" size="sm" className="h-7 px-2 text-[12px]" disabled={pending} onClick={() => set("fixed")}>
            Mark fixed
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" disabled={pending} onClick={() => set("ignored")}>
            Ignore
          </Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px]" disabled={pending} onClick={() => set("open")}>
          Reopen
        </Button>
      )}
      {err && <span className="text-[11px] text-destructive">{err}</span>}
    </span>
  );
}
