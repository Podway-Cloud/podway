"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { copyText } from "@/lib/clipboard";
import { listCustomDomains, addCustomDomain, removeCustomDomain, recheckCustomDomain, type CustomDomainView } from "@/lib/custom-domain-actions";

/**
 * The custom-domain wizard (add-custom-domains). Enter a domain → we show the exact DNS records to
 * add (a CNAME, or an A record for a root/apex domain, plus a TXT ownership challenge) → we verify +
 * issue HTTPS automatically and reflect it here + on the Settings row. One domain per pod (v1); the
 * field prefills the current domain, editable — saving a different one replaces it.
 */
export default function CustomDomainWizard({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const { data: domains } = useQuery({
    queryKey: ["custom-domains", slug],
    queryFn: () => listCustomDomains(slug),
    // Poll while a domain is still resolving, so "Verifying" flips to "Live" on its own.
    refetchInterval: (q) => {
      const d = (q.state.data as CustomDomainView[] | undefined)?.[0];
      return d && (d.status === "pending" || d.status === "verifying") ? 8000 : false;
    },
  });
  const existing = domains?.[0];
  const [host, setHost] = useState<string | null>(null);
  const value = host ?? existing?.hostname ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["custom-domains", slug] });
  const showRecords = existing && value.trim().toLowerCase() === existing.hostname;

  async function save() {
    setError(null);
    setBusy(true);
    try {
      if (existing) await removeCustomDomain(slug, existing.id); // replace: one domain per pod
      const r = await addCustomDomain(slug, value);
      if (!r.ok) setError(r.error);
      else setHost(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      await removeCustomDomain(slug, existing.id);
      setHost("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function recheck() {
    if (!existing) return;
    setBusy(true);
    try {
      await recheckCustomDomain(slug, existing.id);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const step = !existing ? 1 : existing.status === "active" ? 3 : 2;

  return (
    <div className="flex max-w-xl flex-col gap-5">
      {/* Step rail */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border/60 pb-4 text-[12.5px] font-medium">
        {["Add domain", "DNS records", "Verify"].map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "active" : "todo";
          return (
            <span key={label} className={`flex items-center gap-2 ${state === "todo" ? "text-muted-foreground/60" : state === "active" ? "text-foreground" : "text-foreground/80"}`}>
              <span className={`grid size-5 place-items-center rounded-full border text-[11px] ${state === "active" ? "border-primary text-primary" : state === "done" ? "border-success text-success" : "border-border text-muted-foreground"}`}>
                {state === "done" ? "✓" : n}
              </span>
              {label}
            </span>
          );
        })}
      </div>

      {/* Domain field */}
      <div className="flex flex-col gap-2">
        <label htmlFor="cd-host" className="text-sm font-medium">Your domain</label>
        <div className="flex gap-2">
          <Input
            id="cd-host"
            value={value}
            onChange={(e) => setHost(e.target.value)}
            placeholder="app.acme.com"
            className="font-mono"
            spellCheck={false}
          />
          <Button onClick={save} disabled={busy || !value.trim() || showRecords}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : existing ? "Save" : "Continue"}
          </Button>
        </div>
        {error && <p className="text-[13px] text-destructive">{error}</p>}
      </div>

      {/* DNS records — once a domain is saved */}
      {showRecords && existing && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-4">
          <p className="text-[13px] text-muted-foreground">
            Add these at <span className="font-medium text-foreground">your</span> DNS provider — any works.
            We verify &amp; issue HTTPS automatically.
          </p>
          {existing.records.map((rec) => (
            <RecordRow key={rec.type + rec.name} label={rec.label} value={`${rec.name} → ${rec.value}`} />
          ))}
          <div className="mt-1 flex items-center justify-between">
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {existing.status === "active" ? (
                <span className="text-success">✓ Live — served over HTTPS.</span>
              ) : existing.status === "error" ? (
                <span className="text-destructive">Records not found yet — re-check what you added.</span>
              ) : (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Verifying — leave this; it finishes on its own.
                </>
              )}
            </span>
            <div className="flex items-center gap-2">
              {existing.status !== "active" && (
                <Button variant="outline" size="sm" onClick={recheck} disabled={busy}>
                  Re-check
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={remove} disabled={busy} className="border-warning/40 text-warning hover:bg-warning/10 hover:text-warning">
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecordRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground/80">{label}</div>
        <div className="overflow-x-auto whitespace-nowrap font-mono text-[12px] text-foreground/90">{value}</div>
      </div>
      <Button
        variant="outline"
        size="xs"
        className="shrink-0"
        onClick={async () => {
          if (await copyText(value)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}
