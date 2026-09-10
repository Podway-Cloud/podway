"use client";

import { GithubHandle } from "@/components/github-handle";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/use-confirm";
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
  // The repo currently checked out in ~/work (git origin, read by the pod agent). Null on an image
  // too old to report it — then we degrade to the plain "Choose repo" link (no repo to name, nothing
  // to warn about). When we DO know it, the row names it and the action becomes a guarded "Change repo".
  const workRepo = podStatus?.workRepo ?? null;

  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const wizardHref = `/dashboard/pods/${slug}/github?from=settings`;

  // "Change repo" is destructive: cloning a different repo replaces ~/work (deletes anything unpushed).
  // Gate it behind a clear warning here, THEN hand off to the wizard's picker (which still runs its own
  // final "Replace ~/work" confirm with the specific new repo — so nothing is deleted until that step).
  async function changeRepo() {
    const ok = await confirm({
      title: "Change this pod's repository?",
      message: (
        <>
          This pod is working on{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{workRepo}</code> in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">~/work</code>.
        </>
      ),
      warning:
        "Cloning a different repo replaces ~/work. Anything not pushed to GitHub is permanently deleted.",
      confirmLabel: "Choose a different repo",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (ok) router.push(`${wizardHref}&change=1`);
  }

  // Not configured for this deployment → no GitHub row at all.
  if (configured === false) return null;

  // Still loading whether GitHub is configured: reserve the row (same height) with a placeholder so
  // Settings doesn't shift when GitHub "draws last" once its state resolves (owner report).
  if (configured === null && podStatusPending) {
    return (
      <div className="border-t border-border/60 py-3.5 first:border-t-0">
        <div className="flex min-h-[54px] items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-medium">GitHub</div>
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
          <div className="text-sm font-medium">GitHub</div>
          {connected ? (
            connected && workRepo ? (
              <>
                <div className="text-[12.5px] text-muted-foreground">
                  Working on{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{workRepo}</code>
                </div>
                {login ? (
                  <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                    <GithubHandle login={login} />
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-[12.5px] text-muted-foreground">
                {login ? <>Connected as <GithubHandle login={login} /></> : "Connected"}
              </div>
            )
          ) : (
            <div className="text-[12.5px] text-muted-foreground">
              Connect to choose a repo to clone into ~/work
            </div>
          )}
        </div>
        {/* A repo is already cloned → "Change repo" gates on a destructive-warning modal before the
            wizard. No repo yet (or an old image that can't report one) → the plain "Choose repo" link,
            which has nothing to overwrite. Not connected → "Connect". */}
        {connected && workRepo ? (
          <Button variant="outline" size="sm" onClick={changeRepo}>
            Change repo
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href={wizardHref}>{connected ? "Choose repo" : "Connect"}</Link>
          </Button>
        )}
      </div>
      {dialog}
    </div>
  );
}
