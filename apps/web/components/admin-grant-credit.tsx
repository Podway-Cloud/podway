"use client";

import { useState, useTransition } from "react";
import { grantCreditAdmin } from "@/lib/admin-billing-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Admin control: grant credit to one user. A dollar amount + a Grant button that calls the
 * requireAdmin-gated server action. Disabled when billing is off. Mirrors the mutating-in-app
 * button convention (outline). Shows the result inline so the operator gets confirmation.
 */
export default function AdminGrantCredit({ ownerId, disabled }: { ownerId: string; disabled?: boolean }) {
  const [dollars, setDollars] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setMsg(null);
    const value = Number(dollars);
    if (!Number.isFinite(value) || value <= 0) {
      setMsg({ ok: false, text: "Enter a positive dollar amount." });
      return;
    }
    const cents = Math.round(value * 100);
    start(async () => {
      const res = await grantCreditAdmin(ownerId, cents);
      if (res.ok) {
        setMsg({ ok: true, text: `Granted $${(cents / 100).toFixed(2)}.` });
        setDollars("");
      } else {
        setMsg({ ok: false, text: res.error ?? "Grant failed." });
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">$</span>
        <Input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          placeholder="10.00"
          value={dollars}
          disabled={disabled || pending}
          onChange={(e) => setDollars(e.target.value)}
          className="w-28"
          aria-label="Credit amount in dollars"
        />
        <Button
          variant="outline"
          disabled={disabled || pending || dollars.trim() === ""}
          onClick={submit}
        >
          {pending ? "Granting…" : "Grant credit"}
        </Button>
      </div>
      {disabled && (
        <p className="text-[12px] text-muted-foreground">Billing is not configured — grants are disabled.</p>
      )}
      {msg && (
        <p className={msg.ok ? "text-[12px] text-success" : "text-[12px] text-destructive"}>{msg.text}</p>
      )}
    </div>
  );
}
