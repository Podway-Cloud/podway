"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/use-confirm";
import { SESSION_INTERRUPT_WARNING } from "@/lib/pod-copy";
import { adminUpdatePod } from "@/lib/admin-pod-actions";

/** The /admin/pods row action: force a pod onto the pinned image, current or not. */
export default function AdminRowUpdate({ id, name, target }: { id: string; name: string; target: string }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    if (!(await confirm({ title: `Update ${name} to ${target}?`, message: "The pod restarts on the new image.", warning: SESSION_INTERRUPT_WARNING, confirmLabel: "Update" }))) return;
    setErr(null);
    start(async () => {
      const r = await adminUpdatePod(id);
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  };
  return (
    <>
      <Button variant="outline" size="sm" className="h-7 px-2 text-[12px]" disabled={pending} onClick={run} title={err ?? undefined}>
        {pending ? "Updating…" : "Update"}
      </Button>
      {err && <span className="ml-2 text-[11px] text-destructive">{err}</span>}
      {dialog}
    </>
  );
}
