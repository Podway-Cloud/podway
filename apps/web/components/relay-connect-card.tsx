"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Copy, Check, Radio, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RelayInfoDialog } from "@/components/relay-info-dialog";
import { mintRelayCommand, myRelayLive, type RelayCommand, type MyRelayLive } from "@/lib/relay-actions";
import { copyText } from "@/lib/clipboard";

/**
 * Bring up a relay for your own machine — no prose here on purpose: what the relay IS and
 * its limits live behind the ⓘ (RelayInfoDialog). This card is just state + the one command.
 *
 * The command carries a single-use, short-lived code — so the card mints it on demand and
 * shows the countdown, rather than leaving a live code sitting on the page.
 */
function fmtBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export default function RelayConnectCard({ initial }: { initial: MyRelayLive }) {
  const [live, setLive] = useState<MyRelayLive>(initial);
  const [cmd, setCmd] = useState<RelayCommand | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const misses = useRef(0);

  // Poll the live picture (connected? + usage + signed-in sites). Running the command flips
  // the pill to Connected with no refresh. Two guards keep the stats from FLICKERING away:
  //  - a failed poll keeps the last good value (catch), never blanks the card;
  //  - a single `connected:false` (a stale heartbeat between the gateway's updates) is ridden
  //    out — we only downgrade to "Not connected" after two consecutive misses.
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
        /* transient — keep the last good value rather than flicker */
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
  const droppedRecently =
    !!live.lastDroppedAt && Date.now() - Date.parse(live.lastDroppedAt) < 15 * 60_000;

  return (
    <Card className="gap-1 py-4">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-1">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Radio className="size-4 shrink-0 text-muted-foreground" />
            Relay
          </CardTitle>
          <RelayInfoDialog />
        </div>
        {/* Pill + its stats, stacked — the live detail sits directly UNDER the pill and stays put. */}
        <div className="flex flex-col items-end gap-1 text-right">
          {live.connected ? (
            <Badge
              className={
                failing
                  ? "bg-destructive/15 text-destructive hover:bg-destructive/15"
                  : "bg-success/15 text-success hover:bg-success/15"
              }
            >
              {failing ? "Relay failure" : "Connected"}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not connected
            </Badge>
          )}

          {live.connected && (
            <div className="flex flex-col items-end gap-0.5">
              {u && (
                <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                  {u.open > 0 ? `${u.open} active · ` : ""}
                  {fmtBytes(bytes)}
                </span>
              )}
              {droppedRecently && (
                <span
                  className="text-[11px] text-warning"
                  title={`${live.dropCount} drop${live.dropCount === 1 ? "" : "s"} total — the link is flapping`}
                >
                  dropped {Math.max(1, Math.round((Date.now() - Date.parse(live.lastDroppedAt!)) / 60_000))}m ago · unstable
                </span>
              )}
              {live.loginDomains.length > 0 && (
                <span className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                  Signed in: {live.loginDomains.join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2 py-0">
        {!cmd ? (
          <Button variant="outline" size="sm" onClick={generate} disabled={pending}>
            <Terminal className="size-3.5" />
            {pending ? "Generating…" : live.connected ? "Use a different machine" : "Generate command"}
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">
              Run this on your computer (needs Node.js). The code is single-use and expires in about{" "}
              {expiresInMin} min:
            </p>
            <div className="flex items-stretch gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border/60 bg-muted/50 px-3 py-2 text-[12px]">
                {cmd.command}
              </code>
              <Button variant="outline" size="sm" onClick={copy} className="h-auto shrink-0 px-2">
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <Button variant="ghost" size="xs" onClick={generate} disabled={pending}>
              {pending ? "…" : "Generate a new one"}
            </Button>
          </div>
        )}

        {error && <p className="text-[12px] text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
