"use client";

import { GithubHandle } from "@/components/github-handle";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { githubConnStatus } from "@/lib/actions";
import { githubAccountStatus } from "@/lib/github-connect-actions";
import { qk } from "@/lib/query-keys";

/**
 * The GitHub row in a pod's Settings: shows the connection status and links to the
 * dedicated add-GitHub WIZARD page (authorize → choose repo → clone into ~/work).
 * Renders nothing when GitHub connect isn't configured.
 */
export default function GithubConnect({ slug }: { slug: string }) {
  // GitHub is an ACCOUNT-level connection now (connect once, every pod reuses it), so the connected
  // state + login come from the ACCOUNT status — the SAME source the wizard shows ("Connected as
  // @you"). Reading the per-pod in-pod token here instead made Settings say "Connect" while the wizard
  // said "Connected as @you" for the same account (owner report). The per-pod query stays only for
  // `configured` (whether GitHub connect is wired for this env at all).
  // `isPending` is the LOADING state; `data === undefined` is not. They differ exactly when the query
  // FAILED, and conflating them is what pinned this row in its skeleton forever: one transient
  // rejection left podStatus undefined, `configured` stayed null, and the placeholder never resolved
  // until a hard reload (owner: "gets stuck in skeleton", 2026-09-06). Retry a couple of times for a
  // blip, then settle — a settled failure must render SOMETHING, never a spinner with no end.
  const {
    data: podStatus,
    isPending: podStatusPending,
    isError: podStatusFailed,
  } = useQuery({
    queryKey: qk.github(slug),
    queryFn: () => githubConnStatus(slug),
    retry: 2,
  });
  const { data: account } = useQuery({
    queryKey: ["gh-account"],
    queryFn: githubAccountStatus,
    retry: 2,
  });
  // On failure, assume GitHub IS configured so the row renders with its real action rather than
  // vanishing — hiding a control because a status check failed is worse than showing it.
  const configured = podStatus?.configured ?? (podStatusFailed ? true : null);
  const connected = account?.connected ?? false;
  const login = account?.login ?? null;

  // Not configured for this deployment → no GitHub row at all.
  if (configured === false) return null;

  // Still loading whether GitHub is configured: reserve the row (same height) with a placeholder so
  // Settings doesn't shift when GitHub "draws last" once its state resolves (owner report).
  if (configured === null && podStatusPending) {
    return (
      <div className="border-t border-border/60 py-3.5 first:border-t-0">
        <div className="flex min-h-[54px] items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <GitBranch className="h-3.5 w-3.5" /> GitHub
            </div>
            <Skeleton className="mt-1.5 h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border/60 py-3.5 first:border-t-0">
      <div className="flex min-h-[54px] items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <GitBranch className="h-3.5 w-3.5" /> GitHub
          </div>
          <div className="text-[12.5px] text-muted-foreground">
            {connected ? (
              login ? <>Connected as <GithubHandle login={login} /></> : "Connected"
            ) : (
              "Connect to choose a repo to clone into ~/work"
            )}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/dashboard/pods/${slug}/github?from=settings`}>{connected ? "Choose repo" : "Connect"}</Link>
        </Button>
      </div>
    </div>
  );
}
