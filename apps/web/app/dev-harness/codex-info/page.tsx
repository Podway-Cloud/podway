// Dev-only visual harness for the Codex "Continue this Codex session" (i) modal. 404 in production.
"use client";
import { notFound } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CodexContinueSession } from "@/components/codex-continue-session";

export default function Harness() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Dialog open>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Continue this Codex session</DialogTitle>
          <DialogDescription>Use the ChatGPT app on your phone or computer to continue working in this pod.</DialogDescription>
        </DialogHeader>
        <CodexContinueSession podName="podway dev" />
      </DialogContent>
    </Dialog>
  );
}
