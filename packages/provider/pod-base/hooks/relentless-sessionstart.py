#!/usr/bin/env python3
"""SessionStart hook: keep the relentless posture ALIVE across compaction and resume.

Why this exists (added 2026-09-07 after it failed live): relentless was only ever
'invoked' by advisory text in CLAUDE.md / .claude/rules/relentless.md asking the model
to call the Skill tool at session start. On a COMPACTED or RESUMED session that
instruction survives only as summary text, never as an executed action — so the skill's
actual instructions drop out of live context and the agent reverts to 'answer, then
stop'. The Stop hook is the only backstop, and it can only nag at the moment of
stopping; it cannot restore the posture between stops.

This hook injects the relentless CORE directly into context on startup, resume, AND
compact — no tool call required. additionalContext is SessionStart's supported channel
for surfacing text to the model.
"""
import json
import sys

CORE = """<relentless-core injected-by="SessionStart hook, survives compaction">
The `relentless` skill governs this session. If its full instructions are not already
in your context (e.g. after a compaction or resume), invoke it now via the Skill tool.
Until then, these non-negotiable clauses are LIVE:

- DEFAULT STATE IS WORKING. Finishing a task does not end your turn — advance to the
  next item. A status report is NOT a deliverable and NOT a legal ending.
- TWO LEGAL ENDINGS ONLY: (1) a background task is already running (it re-invokes you),
  or (2) your last action was an AskUserQuestion multiple-choice call. Answering the
  owner's direct question is also fine. Everything else with work pending is a bug.
- A PROSE QUESTION AT THE END IS A STOP, not an ask. Use AskUserQuestion for forks.
- NEVER ASSUME on a real fork or a gated (🔴) action — ask, but keep doing independent
  work meanwhile.
- EVIDENCE BEFORE DONE. Merged is not deployed; deployed is not verified. Say where it
  landed and what it takes to reach the owner.
- Batch work into few PRs (owner preference); do not spawn a PR per commit.
Full mechanics: the `relentless` skill + .claude/rules/relentless.md.
</relentless-core>"""

import os

def _hold_enabled() -> bool:
    """Same gate as the Stop hook: inject the posture only when relentless HOLD is on for this pod."""
    for path, key in (
        (os.path.expanduser("~/.podway/relentless.json"), None),
        (os.path.expanduser("~/.podway/pod-spec.live.json"), "relentless"),
        (os.path.expanduser("~/.podway/pod-spec.json"), "relentless"),
    ):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:
            continue
        node = data if key is None else data.get(key)
        if isinstance(node, dict) and "hold" in node:
            return node.get("hold") is True
    return False


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        payload = {}
    if not _hold_enabled():
        # relentless is OFF for this pod — say nothing, exactly like the Stop hook.
        print(json.dumps({}))
        return
    source = payload.get("source", "")  # startup | resume | clear | compact
    # Always inject: the cost is a few hundred tokens, the failure mode it prevents cost
    # a whole session of degraded behavior.
    out = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": CORE,
        }
    }
    if source in ("compact", "resume"):
        out["systemMessage"] = "relentless posture re-injected (session " + source + ")"
    print(json.dumps(out), flush=True)

if __name__ == "__main__":
    main()
