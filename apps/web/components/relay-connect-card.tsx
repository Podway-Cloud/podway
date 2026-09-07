"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Check, Radio, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RelayInfoDialog } from "@/components/relay-info-dialog";
import { Badge } from "@/components/ui/badge";
import { mintRelayCommand, myRelayStatus, type RelayCommand } from "@/lib/relay-actions";
import { copyText } from "@/lib/clipboard";

/**
 * Bring up a relay for your own machine.
 *
 * The relay lets a pod fetch pages that refuse a datacenter IP — through your own
 * connection, from your own browser. You run one command on your computer; the pod
 * never touches your machine except to ask it to fetch a page and get the result back.
 *
 * The command carries a single-use, short-lived code — so the card mints it on demand
 * and shows the countdown, rather than leaving a live code sitting on the page.
 */
/** Same formatting the removed per-pod row used, so the number reads identically. */
function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function RelayConnectCard({
  initial,
}: {
  /** The FULL live shape. This card is the only relay surface now (the per-pod row was
   *  removed 2026-09-07), so it carries tunnel health and usage too, not just connected. */
  initial: {
    connected: boolean;
    loginDomains: string[];
    health?: { state?: string | null; detail?: string | null } | null;
    usage?: { bytesUp: number; bytesDown: number } | null;
  };
}) {
  const [status, setStatus] = useState(initial);
  const [cmd, setCmd] = useState<RelayCommand | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Poll connection status while the card is open, so running the command flips the
  // badge to "connected" without a manual refresh.
  useEffect(() => {
    const t = setInterval(() => void myRelayStatus().then(setStatus).catch(() => undefined), 4000);
    return () => clearInterval(t);
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

  return (
    <Card className="gap-1 py-4">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Radio className="size-4 shrink-0 text-muted-foreground" />
          Relay
          {/* The owner's ONE explanation of what the relay does and its limits. It lived on the
              per-pod row; removing that row left it rendered nowhere at all, which a visual test
              caught. Moved here with the rest of the relay (2026-09-07). */}
          <RelayInfoDialog />
        </CardTitle>
        {status.connected ? (
          <Badge className="bg-success/15 text-success hover:bg-success/15">Connected</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Not connected
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3 py-0">
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          Some websites block traffic from datacenters. Podway Relay lets your pods fetch those sites
          through your computer&apos;s internet connection. Start it with one command and leave it
          running. Pages open signed out by default; to use your account on a specific site, sign in
          once with <code className="rounded bg-muted px-1 py-0.5 text-[11px]">relay login</code>.
        </p>

        {/* Tunnel health + traffic. These used to sit on EVERY pod's settings row, where the
            figures were account-wide totals rendered against one pod — a wrong number, not just
            clutter. They belong here, once, where "one relay for all your pods" is the frame. */}
        {status.connected && (status.health || status.usage) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            {status.health?.state && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={
                    status.health.state === "failed"
                      ? "size-1.5 rounded-full bg-destructive"
                      : "size-1.5 rounded-full bg-success"
                  }
                  aria-hidden
                />
                {status.health.state === "failed" ? "Tunnel failing" : "Tunnel healthy"}
              </span>
            )}
            {status.usage && (
              <span className="tabular-nums">
                {fmtBytes(status.usage.bytesUp + status.usage.bytesDown)} through the relay
              </span>
            )}
          </div>
        )}

        {status.connected && status.loginDomains.length > 0 && (
          <p className="text-[12px] text-muted-foreground">
            Signed in for:{" "}
            {status.loginDomains.map((d) => (
              <span key={d} className="mr-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">
                {d}
              </span>
            ))}
          </p>
        )}

        {!cmd ? (
          <Button variant="outline" size="sm" onClick={generate} disabled={pending}>
            <Terminal className="size-3.5" />
            {pending ? "Generating…" : status.connected ? "Connect another machine" : "Generate command"}
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
