"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * The owner's referral link — `<origin>/start?ref=<code>`, where the code is their account id (the
 * existing first-touch `?ref=` capture makes them the referrer). Built client-side so the origin is
 * always correct. Give $10, get $10 once the friend keeps a paid pod ~30 days.
 */
export default function ReferralLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window !== "undefined" ? `${window.location.origin}/start?ref=${code}` : `/start?ref=${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the link is still visible to copy by hand */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 text-[12.5px]">{link}</code>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
