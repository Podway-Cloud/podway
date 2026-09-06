"use client";

import { GithubHandle } from "@/components/github-handle";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/query-keys";
import { GithubDevicePanel } from "@/components/github-device-panel";
import { RepoPicker } from "@/components/repo-picker";
import {
  githubConnStatus,
  startPodGhLogin,
  pollPodGhLogin,
  githubConnRepos,
  cloneRepoIntoPod,
} from "@/lib/actions";
import {
  githubAccountStatus,
  startGithubAccountConnect,
  startGithubAccountWebConnect,
  completeGithubAccountConnect,
  githubAccountRepos,
} from "@/lib/github-connect-actions";

type Repo = { fullName: string; private: boolean; updatedAt: string };

/**
 * Add GitHub to an existing pod — choose a repo and clone it into ~/work (only when empty — one pod,
 * one repo). CLOUD reads the owner's DURABLE ACCOUNT connection (global-github-connection): if it's
 * already connected (in Settings), there is NO "Connect" step — it goes straight to picking a repo,
 * and the account token fans out to this pod (velsa: don't ask to connect again when already
 * connected). Only an unconnected account shows a one-click Connect here. SELF-HOST keeps its per-pod
 * in-pod `gh` login. The page frames the content, so no card.
 */
export default function GithubWizard({
  slug,
  backHref,
  oss = false,
}: {
  slug: string;
  backHref?: string;
  oss?: boolean;
}) {
  const back = backHref ?? `/dashboard/pods/${slug}`;
  const queryClient = useQueryClient();

  // CLOUD: connection is the owner's ACCOUNT connection (one connect, every pod reuses it). OSS: the
  // pod's own in-pod login. The pod query also carries workRepo (what ~/work already holds).
  const { data: pod } = useQuery({ queryKey: qk.github(slug), queryFn: () => githubConnStatus(slug) });
  const { data: account } = useQuery({ queryKey: ["gh-account"], queryFn: githubAccountStatus, enabled: !oss });
  const [flow, setFlow] = useState<{ connected: boolean; login: string | null } | null>(null);
  const src = oss ? pod : account;
  const connected: boolean | null = flow ? flow.connected : (src?.connected ?? null);
  const login: string | null = flow ? flow.login : (src?.login ?? null);
  const workRepo: string | null = pod?.workRepo ?? null; // pod-agent signal; null on an older image
  const webFlow = !oss && account?.webFlow === true;

  const [device, setDevice] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [chosenRepo, setChosenRepo] = useState("");
  const [cloneDifferent, setCloneDifferent] = useState(false); // reveal the picker to REPLACE an existing repo
  const [cloning, setCloning] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);

  // Repos once connected: cloud lists the ACCOUNT's repos, OSS the pod's own.
  const { data: repos = null, error: reposErr } = useQuery({
    queryKey: [...qk.github(slug), "repos", oss ? "pod" : "account"] as const,
    enabled: connected === true,
    queryFn: async () => {
      if (oss) {
        const r = await githubConnRepos(slug);
        if ("error" in r) throw new Error(r.error);
        return r.repos as Repo[];
      }
      return (await githubAccountRepos()) as Repo[];
    },
  });

  // A one-click OAuth return lands with ?github=connected|denied|error. On success the account query
  // refetches and reflects "connected".
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("github");
    if (p === "denied") setError("GitHub authorization was cancelled.");
    else if (p === "error") setError("Couldn’t connect GitHub — please try again.");
    else if (p === "connected") void queryClient.invalidateQueries({ queryKey: ["gh-account"] });
    return () => {
      if (poll.current) clearTimeout(poll.current);
    };
  }, [queryClient]);

  // Cloud one-click OAuth: connect the ACCOUNT (fans out to every pod), returning to this wizard.
  const connectWeb = useCallback(async () => {
    setError(null);
    setBusy(true);
    const r = await startGithubAccountWebConnect(window.location.pathname);
    if ("url" in r) window.location.href = r.url;
    else {
      setError(r.error);
      setBusy(false);
    }
  }, []);

  // Device-code fallback: OSS runs it IN the pod; cloud-without-a-client-secret uses the ACCOUNT flow.
  const connectDevice = useCallback(async () => {
    setError(null);
    setBusy(true);
    const start = oss ? await startPodGhLogin(slug) : await startGithubAccountConnect();
    if ("error" in start) {
      setError(start.error);
      setBusy(false);
      return;
    }
    setDevice({ userCode: start.userCode, verificationUri: start.verificationUri });
    const deadline = Date.now() + start.expiresIn * 1000;
    const iv = start.interval * 1000;
    const tick = async () => {
      const r = oss ? await pollPodGhLogin(slug, start.deviceCode) : await completeGithubAccountConnect(start.deviceCode);
      if (r.status === "connected") {
        setFlow({ connected: true, login: r.login });
        setDevice(null);
        setBusy(false);
        void queryClient.invalidateQueries({ queryKey: oss ? qk.github(slug) : ["gh-account"] });
        return;
      }
      if (r.status === "error") {
        setError("message" in r ? r.message : "Couldn’t connect GitHub.");
        setDevice(null);
        setBusy(false);
        return;
      }
      if (Date.now() > deadline || r.status === "expired") {
        setError("Code expired — try connecting again.");
        setDevice(null);
        setBusy(false);
        return;
      }
      poll.current = setTimeout(tick, iv);
    };
    poll.current = setTimeout(tick, iv);
  }, [oss, slug, queryClient]);

  const connect = () => (webFlow ? connectWeb() : connectDevice());
  const cancelDevice = () => {
    if (poll.current) clearTimeout(poll.current);
    setDevice(null);
    setBusy(false);
  };

  const clone = useCallback(
    async (force = false) => {
      if (!chosenRepo) return;
      setCloning(true);
      setResult(null);
      setConfirmOverwrite(false);
      const r = await cloneRepoIntoPod(slug, chosenRepo, force);
      setCloning(false);
      if ("error" in r) setResult({ tone: "err", text: r.error });
      else if (r.status === "not-empty") setConfirmOverwrite(true);
      else setResult({ tone: "ok", text: `Cloned ${chosenRepo} into ~/work.` });
    },
    [slug, chosenRepo],
  );

  return (
    <div className="flex flex-col gap-5">
      {(error || reposErr) && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error ?? (reposErr as Error).message}
        </p>
      )}

      {connected === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Checking GitHub…
        </p>
      ) : !connected ? (
        // Account isn't connected yet — offer a one-click connect (fans out to every pod). This is the
        // ONLY connect surface in the wizard; once connected it never shows again.
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {oss
              ? "Authorize GitHub so this pod can clone your repositories."
              : "Connect GitHub once — every pod reuses it. This pod gets access straight away."}
          </p>
          {device ? (
            <>
              <GithubDevicePanel userCode={device.userCode} verificationUri={device.verificationUri} />
              <div>
                <Button variant="outline" size="sm" onClick={cancelDevice}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div>
              <Button variant="outline" onClick={connect} disabled={busy}>
                {busy ? "Connecting…" : "Connect GitHub"}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {login ? (
              <>
                Connected as <GithubHandle login={login} />.
              </>
            ) : (
              "Connected."
            )}{" "}
            {workRepo && !cloneDifferent ? (
              <>
                This pod is working on{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{workRepo}</code> in{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">~/work</code>.
              </>
            ) : (
              <>
                Pick a repository to clone into{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">~/work</code>.
              </>
            )}
          </p>
          {workRepo && !cloneDifferent ? (
            <div>
              <Button variant="outline" size="sm" onClick={() => setCloneDifferent(true)}>
                Clone a different repository…
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <RepoPicker
                repos={repos ?? []}
                value={chosenRepo}
                onChange={setChosenRepo}
                placeholder={repos === null ? "Loading your repositories…" : "Search repositories…"}
              />
              <Button className="self-end" disabled={!chosenRepo || cloning} onClick={() => clone()}>
                {cloning ? "Cloning…" : "Clone to ~/work"}
              </Button>
            </div>
          )}
          {confirmOverwrite && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[13px]">
              <p className="font-medium text-destructive">
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">~/work</code> already has a workspace.
              </p>
              <p className="mt-1 text-muted-foreground">
                Replace it with <span className="font-medium text-foreground">{chosenRepo}</span>? This{" "}
                <span className="font-medium">permanently deletes</span> the current contents of{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">~/work</code>, including anything not pushed to git.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button variant="destructive" size="sm" disabled={cloning} onClick={() => clone(true)}>
                  {cloning ? "Replacing…" : "Replace ~/work"}
                </Button>
                <Button variant="ghost" size="sm" disabled={cloning} onClick={() => setConfirmOverwrite(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {result && (
            <p
              className={
                result.tone === "ok"
                  ? "text-[13px] text-success"
                  : result.tone === "warn"
                    ? "text-[13px] text-warning"
                    : "text-[13px] text-destructive"
              }
            >
              {result.text}
            </p>
          )}
        </div>
      )}

      {result?.tone === "ok" && (
        <div className="flex justify-end pt-1">
          <Button asChild>
            <Link href={back}>Done</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
