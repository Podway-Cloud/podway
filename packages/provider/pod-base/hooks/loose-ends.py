#!/usr/bin/env python3
"""Report work this pod STRANDED — the failure the stop hook structurally cannot see.

The stop hook catches ONE shape: a turn ending on a prose question. That is a text heuristic, and
the worst real failure has no text signature at all. On 2026-09-06 an agent pushed three branches
and never opened their PRs, then wrote a confident summary. Nothing caught it, because nothing was
wrong with the sentences — the work was simply left on the floor.

So this checks STATE, not phrasing:
  - a pushed branch with no pull request
  - an open PR with no activity for a while
  - uncommitted changes sitting in the working tree
  - a local branch never pushed at all

Exits 0 and prints NOTHING when everything is accounted for. It is meant to run on a schedule and
wake the agent only when there is genuinely something to finish, so a quiet week stays quiet — a
checker that always says something gets ignored, which is how the last one failed.

  loose-ends.py            human report; exit 1 when anything is stranded
  loose-ends.py --json     for a scheduled job
"""
import json
import os
import subprocess
import sys

STALE_PR_HOURS = int(os.environ.get("LOOSE_ENDS_PR_HOURS", "12"))
# Only RECENT branches count. Without this the check reported 55 items on a real repo — every
# abandoned branch from months of work — and a checker that always says something is one nobody
# reads, which is precisely the failure mode this exists to avoid. Stranded means "you were just
# working on this and walked away", not "this branch exists".
RECENT_HOURS = int(os.environ.get("LOOSE_ENDS_RECENT_HOURS", "24"))


def sh(*args: str, cwd: str) -> str:
    try:
        return subprocess.run(
            args, cwd=cwd, capture_output=True, text=True, timeout=60
        ).stdout.strip()
    except Exception:
        return ""


def main() -> int:
    repo = os.environ.get("LOOSE_ENDS_REPO", os.path.expanduser("~/work"))
    if not os.path.isdir(os.path.join(repo, ".git")):
        return 0  # not a repo — nothing this check can say

    as_json = "--json" in sys.argv
    findings: list[dict] = []

    # Uncommitted work. Untracked-only is noisy (scratch files), so require tracked modifications.
    if sh("git", "status", "--porcelain=v1", "--untracked-files=no", cwd=repo):
        findings.append({
            "kind": "dirty-tree",
            "what": "tracked files are modified and uncommitted",
            "why": "an interrupted session loses them; they are not in any branch",
        })

    # Branches that exist locally or remotely but have no PR. `gh` is the only way to know, and a
    # missing/unauthenticated gh is not a finding — it is an absence of information, so stay silent.
    prs = sh("gh", "pr", "list", "--state", "open", "--json",
             "number,headRefName,updatedAt,title", cwd=repo)
    if prs:
        try:
            open_prs = json.loads(prs)
        except json.JSONDecodeError:
            open_prs = []
        with_pr = {p["headRefName"] for p in open_prs}

        # A branch pushed to origin with no PR is the exact 2026-09-06 failure.
        remote = sh("git", "for-each-ref", "--format=%(refname:short)", "refs/remotes/origin", cwd=repo)
        default = sh("git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD", cwd=repo).split("/")[-1] or "main"
        for ref in remote.splitlines():
            b = ref.split("/", 1)[-1]
            if b in ("HEAD", default) or not b:
                continue
            if b in with_pr:
                continue
            # Only branches that actually differ from the default — a stale merged branch is not work.
            # `git cherry` compares PATCH IDs, not commit hashes, so it still recognises work that
            # landed via SQUASH merge — which is how this repo merges everything. A plain
            # `rev-list --count` counts those commits as missing and reported three already-merged
            # branches as stranded on the first real run. A false "you left work behind" is the one
            # kind of noise that makes this check worth ignoring, so it has to be right.
            unmerged = [
                ln for ln in sh("git", "cherry", f"origin/{default}", ref, cwd=repo).splitlines()
                if ln.startswith("+")
            ]
            if not unmerged:
                continue  # content is already in the default branch, however it was merged
            # Recency is what separates "walked away mid-task" from "abandoned months ago".
            last = sh("git", "log", "-1", "--format=%ct", ref, cwd=repo)
            if not last.isdigit():
                continue
            import time as _t
            if (_t.time() - int(last)) / 3600 > RECENT_HOURS:
                continue
            if True:
                findings.append({
                    "kind": "branch-without-pr",
                    "what": f"branch '{b}' is pushed but has no pull request",
                    "why": "the work is committed and invisible; nobody can review or merge it",
                })

        import datetime as _dt
        now = _dt.datetime.now(_dt.timezone.utc)
        for p in open_prs:
            try:
                age = (now - _dt.datetime.fromisoformat(p["updatedAt"].replace("Z", "+00:00"))).total_seconds() / 3600
            except Exception:
                continue
            if age >= STALE_PR_HOURS:
                findings.append({
                    "kind": "stale-pr",
                    "what": f"PR #{p['number']} has had no activity for {int(age)}h — {p['title'][:60]}",
                    "why": "an open PR nobody is moving is work that never lands",
                })

    if as_json:
        print(json.dumps({"stranded": len(findings), "findings": findings}))
    elif findings:
        print(f"loose-ends: {len(findings)} item(s) stranded")
        for f in findings:
            print(f"  - {f['what']}\n      {f['why']}")
    return 1 if findings else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)  # never let this check itself become the problem
