"use client";

import Link from "next/link";
import { ArrowUpRight, FileCode } from "lucide-react";
import { GithubHandle } from "@/components/github-handle";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import GithubMark from "@/components/github-mark";
import { GithubDevicePanel } from "@/components/github-device-panel";
import { useConfirm } from "@/components/ui/use-confirm";
import {
  githubAccountStatus,
  startGithubAccountConnect,
  completeGithubAccountConnect,
  startGithubAccountWebConnect,
  disconnectGithubAccount,
  githubReposToPods,
} from "@/lib/github-connect-actions";

/**
 * The owner's ONE GitHub connection, managed in dashboard Settings (global-github-connection).
 * Connect once here and every pod reuses it; disconnect/reconnect live ONLY here (the launch and
 * add-to-pod wizards show status but can't disconnect). Disconnect is destructive — it revokes
 * GitHub from every pod — so it's behind a warning. The token never touches this component.
 */
export function GithubAccountCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [webFlow, setWebFlow] = useState(false);
  const [login, setLogin] = useState<string | null>(null);
  const [device, setDevice] = useState<{ userCode: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [repos, setRepos] = useState<{ repo: string; pods: { slug: string; name: string; status: string }[] }[]>([]);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    githubAccountStatus()
      .then((s) => {
        setConfigured(s.configured);
        setWebFlow(s.webFlow);
        setLogin(s.login);
        if (s.login) void githubReposToPods().then(setRepos).catch(() => undefined);
      })
      .catch(() => setConfigured(false));
    // A one-click return lands with ?github=connected|denied|error — surface the non-happy paths.
    const p = new URLSearchParams(window.location.search).get("github");
    if (p === "denied") setError("GitHub connection was declined.");
    else if (p === "error") setError("Couldn’t complete the GitHub connection — try again.");
    else if (p === "connected") setNotice("GitHub connected — every pod now has access.");
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  // One-click web OAuth: navigate to GitHub; the callback returns to this page with ?github=…
  async function connectWeb() {
    setError(null);
    setBusy(true);
    const r = await startGithubAccountWebConnect(window.location.pathname);
    if ("error" in r) {
      setError(r.error);
      setBusy(false);
      return;
    }
    window.location.href = r.url;
  }

  // Device-code fallback (no client secret configured).
  async function connectDevice() {
    setError(null);
    setBusy(true);
    const start = await startGithubAccountConnect();
    if ("error" in start) {
      setError(start.error);
      setBusy(false);
      return;
    }
    setDevice({ userCode: start.userCode, url: start.verificationUri });
    const deadline = Date.now() + start.expiresIn * 1000;
    const poll = async () => {
      const r = await completeGithubAccountConnect(start.deviceCode);
      if (r.status === "connected") {
        setDevice(null);
        setBusy(false);
        setLogin(r.login);
        setNotice("GitHub connected — every pod now has access.");
        return;
      }
      if (r.status === "error") {
        setError(r.message);
        setDevice(null);
        setBusy(false);
        return;
      }
      if (Date.now() > deadline) {
        setError("Code expired — try connecting again.");
        setDevice(null);
        setBusy(false);
        return;
      }
      const wait = (r.status === "slow_down" ? r.interval : start.interval) * 1000;
      pollTimer.current = setTimeout(poll, wait);
    };
    pollTimer.current = setTimeout(poll, start.interval * 1000);
  }

  const connect = () => (webFlow ? connectWeb() : connectDevice());

  function cancelConnect() {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
    setDevice(null);
    setBusy(false);
  }

  async function disconnect() {
    const ok = await confirm({
      title: "Disconnect GitHub?",
      message: "This disconnects GitHub from your whole account.",
      warning:
        "Every one of your pods loses GitHub access — they can’t clone, pull, or push private repos until you reconnect. Repos already cloned stay on disk. Reconnecting restores access everywhere.",
      confirmLabel: "Disconnect GitHub",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setNotice(null);
    await disconnectGithubAccount().catch(() => {});
    setLogin(null);
    setNotice("GitHub disconnected from all pods.");
  }

  if (configured === null) return null; // still loading
  if (!configured) return null; // GitHub not configured on this deployment — nothing to manage

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      {dialog}
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border bg-white/[0.04] text-foreground">
            <GithubMark className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15.5px] font-semibold">GitHub</h2>
            {login && (
              <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
                Connected as <GithubHandle login={login} /> · reused by every pod
              </p>
            )}
          </div>
        </div>
        {login ? (
          <Badge className="gap-1.5 bg-success/15 text-success hover:bg-success/15">
            <span className="size-1.5 rounded-full bg-success" />
            Connected
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Not connected
          </Badge>
        )}
      </div>

      {login ? (
        <>
          {repos.length > 0 ? (
            <div className="border-y border-border/60">
              <div className="px-5 pb-1.5 pt-3 text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                Cloned repositories → pods
              </div>
              <ul>
                {repos.map((r) => (
                  <li
                    key={r.repo}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-5 py-2.5 first:border-t-0"
                  >
                    <span className="flex min-w-0 items-center gap-2 font-mono text-[12.5px]">
                      <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{r.repo}</span>
                    </span>
                    <span className="ml-auto flex flex-wrap justify-end gap-2">
                      {r.pods.map((pod) => (
                        <Link
                          key={pod.slug}
                          href={`/dashboard/pods/${pod.slug}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-sky-400/25 bg-sky-400/[0.06] px-2 py-1 text-[12px] font-medium text-sky-300 hover:bg-sky-400/[0.12]"
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              pod.status === "running" ? "bg-success" : "bg-muted-foreground/60",
                            )}
                          />
                          {pod.name}
                          <ArrowUpRight className="size-3" />
                        </Link>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="border-y border-border/60 px-5 py-3 text-[12.5px] text-muted-foreground">
              No repositories cloned into a pod yet.
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <span className="text-[12px] text-muted-foreground">Disconnecting revokes GitHub from every pod.</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={connect} disabled={busy || !!device}>
                {busy ? "Reconnecting…" : "Reconnect"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-warning/40 text-warning hover:bg-warning/10 hover:text-warning"
                onClick={disconnect}
                disabled={busy}
              >
                Disconnect
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-5 py-4">
          <span className="text-[12.5px] text-muted-foreground">
            Connect once — every pod you launch or add then reuses it, no per-pod sign-in.
          </span>
          {device ? (
            <Button variant="outline" size="sm" onClick={cancelConnect}>Cancel</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={connect} disabled={busy}>
              {busy ? "Connecting…" : "Connect GitHub"}
            </Button>
          )}
        </div>
      )}

      {device && (
        <div className="border-t border-border/60 px-5 py-4">
          <GithubDevicePanel userCode={device.userCode} verificationUri={device.url} />
        </div>
      )}
      {error && <p className="px-5 pb-4 text-[13px] text-destructive">{error}</p>}
      {notice && !error && <p className="px-5 pb-4 text-[13px] text-success">{notice}</p>}
    </section>
  );
}
