"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Copy, Check, Radio, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RelayInfoDialog } from "@/components/relay-info-dialog";
import { mintRelayCommand, myRelayLive, type RelayCommand, type MyRelayLive } from "@/lib/relay-actions";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/**
 * The owner's relay, in the Settings "connection card" shape: a header whose status pill sits on
 * the RIGHT, a full-width strip of live stats beneath it (link health, active streams, data moved,
 * signed-in sites), and the one action in the footer. No prose — the what/why/limits live behind the
 * ⓘ (RelayInfoDialog).
 */
function fmtBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-[15px] font-semibold tabular-nums">{children}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export default function RelayConnectCard({ initial }: { initial: MyRelayLive }) {
  const [live, setLive] = useState<MyRelayLive>(initial);
  const [cmd, setCmd] = useState<RelayCommand | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const misses = useRef(0);

  // Poll the live picture; keep last-good on a failed poll and debounce a transient connected:false
  // (a stale heartbeat) so the stats never flicker away — two consecutive misses to downgrade.
  useEffect(() => {
    const tick = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const next = await myRelayLive();
        setLive((prev) => {
          if (!next.connected && prev.connected) {
            misses.current += 1;
            return misses.current >= 2 ? next : prev;
          }
          misses.current = 0;
          return next;
        });
      } catch {
        /* keep last good */
      } finally {
        busy.current = false;
      }
    };
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  const generate = () =>
    start(async () => {
      setError(null);
      setCopied(false);
      try {
        setCmd(await mintRelayCommand());
      } catch {
        setError("Could not generate a command — try again.");
      }
    });

  const copy = async () => {
    if (!cmd) return;
    if (await copyText(cmd.command)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      setError("Copy failed — select the command and copy it manually.");
    }
  };

  const expiresInMin = cmd ? Math.max(0, Math.round((cmd.expiresAt - Date.now()) / 60000)) : 0;
  const u = live.usage;
  const bytes = u ? u.bytesUp + u.bytesDown : 0;
  const failing = live.health?.state === "failed";
  const droppedRecently = !!live.lastDroppedAt && Date.now() - Date.parse(live.lastDroppedAt) < 15 * 60_000;

  const linkLabel = failing ? "Failed" : live.health?.state === "ok" ? "Healthy" : "Checking";
  const linkClass = failing ? "text-destructive" : live.health?.state === "ok" ? "text-success" : "text-muted-foreground";

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Header — icon + name + ⓘ on the left, the status pill on the RIGHT. */}
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-sky-400/25 bg-sky-400/10 text-sky-400">
            <Radio className="size-[18px]" />
          </span>
          <div className="flex items-center gap-1">
            <h2 className="text-[15.5px] font-semibold">Relay</h2>
            <RelayInfoDialog />
          </div>
        </div>
        {live.connected ? (
          <Badge
            className={cn(
              "gap-1.5",
              failing
                ? "bg-destructive/15 text-destructive hover:bg-destructive/15"
                : "bg-success/15 text-success hover:bg-success/15",
            )}
          >
            <span className={cn("size-1.5 rounded-full", failing ? "bg-destructive" : "bg-success")} />
            {failing ? "Relay failure" : "Connected"}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Not connected
          </Badge>
        )}
      </div>

      {live.connected ? (
        <>
          {/* Full-width live stats strip. */}
          <div className="grid grid-cols-2 divide-x divide-y divide-border/60 border-y border-border/60 sm:grid-cols-4 sm:divide-y-0">
            <Stat label="Link" sub={live.health?.ms != null ? `${live.health.ms} ms` : "through your computer"}>
              <span className={linkClass}>{linkLabel}</span>
            </Stat>
            <Stat label="Active streams" sub={u ? `${u.connections} total this session` : undefined}>
              {u ? u.open : "—"}
            </Stat>
            <Stat label="Transferred" sub={u ? `↑ ${fmtBytes(u.bytesUp)} · ↓ ${fmtBytes(u.bytesDown)}` : undefined}>
              {u ? fmtBytes(bytes) : "—"}
            </Stat>
            <Stat label="Signed-in sites">
              {live.loginDomains.length > 0 ? (
                <span className="flex flex-wrap gap-1">
                  {live.loginDomains.map((d) => (
                    <span key={d} className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                      {d}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-[13px] font-normal text-muted-foreground">None yet</span>
              )}
            </Stat>
          </div>

          {/* Footer — health/stability note on the left, the action on the right. */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <span className="text-[12px] text-muted-foreground">
              {droppedRecently ? (
                <span className="text-warning">
                  Dropped {Math.max(1, Math.round((Date.now() - Date.parse(live.lastDroppedAt!)) / 60_000))}m ago · link is
                  flapping ({live.dropCount} total)
                </span>
              ) : (
                "Running on your machine."
              )}
            </span>
            {!cmd ? (
              <Button variant="outline" size="sm" onClick={generate} disabled={pending}>
                <Terminal className="size-3.5" />
                {pending ? "Generating…" : "Use a different machine"}
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        // Not connected — no strip; a single action to bring the relay up.
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-4">
          <span className="text-[12.5px] text-muted-foreground">Not running — start it on your computer with one command.</span>
          {!cmd ? (
            <Button variant="outline" size="sm" onClick={generate} disabled={pending}>
              <Terminal className="size-3.5" />
              {pending ? "Generating…" : "Generate command"}
            </Button>
          ) : null}
        </div>
      )}

      {/* The command block, revealed on demand, spans the card width. */}
      {cmd && (
        <div className="space-y-2 border-t border-border/60 px-5 py-4">
          <p className="text-[12px] text-muted-foreground">
            Run this on your computer (needs Node.js). The code is single-use and expires in about {expiresInMin} min:
          </p>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border/60 bg-muted/50 px-3 py-2 text-[12px]">
              {cmd.command}
            </code>
            <Button variant="outline" size="sm" onClick={copy} className="h-auto shrink-0 px-2">
              {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="xs" onClick={generate} disabled={pending}>
              {pending ? "…" : "Generate a new one"}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setCmd(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {error && <p className="px-5 pb-4 text-[12px] text-destructive">{error}</p>}
    </section>
  );
}
