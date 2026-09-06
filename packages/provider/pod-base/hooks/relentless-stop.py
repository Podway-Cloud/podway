#!/usr/bin/env python3
"""Stop hook: a stop must be EARNED, not assumed.

Why this is inverted (2026-09-06)
---------------------------------
The previous version was allow-by-default: it blocked exactly ONE shape — a message ending in a
prose question with no AskUserQuestion and no background task — and allowed everything else. So
"here is my status report", "done, tests pass", and finishing one item with thirty still open in the
register all sailed through. Measured on this pod mid-session: 748 of ~1508 assistant turns ended as
plain stops, during a session whose subject was fixing this. The hook fired about twice.

The cause is not defiance, it is the model's strongest prior: answer, then yield to the human.
Advisory text (CLAUDE.md, rule files, skills) argues with that prior in one sentence and loses,
increasingly as context grows. Only enforcement changes the outcome — so the default flips:

    ALLOW only when a legal ending is PROVABLE. Otherwise block, and name the next item.

Naming the item matters. A generic "keep working" is the exact gap the agent fills with another
status report; handing it the next task removes the excuse.

Safety, because a block-by-default wall can wedge a session and a wedged pod costs money:
  * honour stop_hook_active — never fight the runtime's own loop-breaker;
  * a consecutive-block cap, after which it yields and SAYS it is yielding;
  * an empty register is a legal, deliberately reachable idle — never manufacture work.

Off by default. Both switches come from ~/.podway-pod-spec.json, which the platform already
rewrites on boot and on config refresh, so a change takes effect without an image rebuild. A missing
or unparseable spec means OFF: a pod must never inherit an enforcement wall by accident.
"""

import json
import os
import re
import subprocess
import sys
import time

ALLOW = 0

# The pod spec, in the order it should be trusted.
#
# /etc is the LIVE copy: the control plane patches it when the owner changes a setting, so a toggle
# takes effect on the very next stop instead of waiting for a reboot. ~/.podway-pod-spec.json is the
# boot-time BACKUP that init.sh copies out of /etc, and it does NOT receive those patches — reading
# only that one made the switch look dead on a running pod.
SPEC_LIVE = "/etc/podway/pod-spec.json"
SPEC = os.path.expanduser("~/.podway-pod-spec.json")
# A LOCAL override, checked first.
#
# ~/.podway-pod-spec.json is PLATFORM-OWNED: it is rewritten on boot and on every config refresh, so
# anything hand-set there silently disappears. That happened during the first trial of this hook on
# 2026-09-06 — the spec was rewritten at 14:31, the relentless key vanished with it, and the wall
# went OFF without anyone noticing until the hook allowed a stop it should have blocked.
#
# Until the control plane delivers the flag properly, this file is how a pod can be put under the
# wall durably. It is also the honest place for a per-pod override the platform does not manage.
LOCAL = os.path.expanduser("~/.podway/relentless.json")
STATE = os.path.expanduser("~/.podway/relentless-state.json")
HOME_REGISTER = os.path.expanduser("~/.podway/register.md")
# The AGENT's own queue — deliberately NOT 0asks.md.
#
# 0asks.md is the OWNER's list: a deploy, a click, a credential, a decision. Counting it as
# actionable would wall the agent in behind work it physically cannot do, which makes the hook both
# useless and infuriating. 0audit.md is likewise a register of what is currently TRUE (known bugs,
# fragile spots), not a task queue. Neither is the agent's backlog.
REPO_REGISTERS = ("WORKLOG.md",)

# After this many refusals with no intervening user turn, yield. A wall that cannot be escaped is
# worse than no wall: the user may have stepped away, and a pod cannot argue its way out of a loop.
MAX_CONSECUTIVE_BLOCKS = 3


# ---- settings ---------------------------------------------------------------------------------

def _hold_enabled() -> bool:
    """The free half of relentless. OFF unless explicitly on — never inherit a wall by accident."""
    for path, key in ((LOCAL, None), (SPEC_LIVE, "relentless"), (SPEC, "relentless")):
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except Exception:
            continue
        node = data if key is None else data.get(key)
        if isinstance(node, dict) and "hold" in node:
            return node.get("hold") is True
    return False


CACHE = os.path.expanduser("~/.podway/loose-ends.json")
LOOSE_ENDS = "/opt/podway/hooks/loose-ends.py"
STALE_SECS = 4 * 60 * 60


def _refresh_stranded_async() -> None:
    """Kick the slow check off detached. Never blocks the stop, never raises."""
    script = LOOSE_ENDS if os.path.exists(LOOSE_ENDS) else os.path.expanduser("~/.claude/hooks/loose-ends.py")
    if not os.path.exists(script):
        return
    try:
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        # Write via a temp file so a reader never sees a half-written cache. Do NOT gate the move
        # on the exit code: loose-ends.py exits 1 precisely WHEN something is stranded, so `&&` would
        # cache only the empty results — backwards, and it silently produced an always-empty cache
        # until an end-to-end test caught it. Gate on the file being non-empty instead.
        cmd = f'python3 {script} --json > {CACHE}.tmp 2>/dev/null; [ -s {CACHE}.tmp ] && mv {CACHE}.tmp {CACHE} || rm -f {CACHE}.tmp'
        subprocess.Popen(["sh", "-c", cmd], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         stdin=subprocess.DEVNULL, start_new_session=True)
    except Exception:
        pass


def _stranded_note() -> str:
    """Cached findings, or '' — and refresh in the background when the cache is stale/missing."""
    try:
        age = time.time() - os.path.getmtime(CACHE)
    except OSError:
        _refresh_stranded_async()
        return ""
    if age > STALE_SECS:
        _refresh_stranded_async()
    try:
        with open(CACHE, encoding="utf-8") as fh:
            payload = json.load(fh)
    except Exception:
        return ""
    if payload.get("reported"):     # say it once per refresh, not on every single stop
        return ""
    findings = payload.get("findings") or []   # loose-ends.py --json: {"stranded": N, "findings": [{kind, what, why}]}
    if not findings:
        return ""
    try:                            # mark reported, best-effort
        payload["reported"] = True
        with open(CACHE, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)
    except Exception:
        pass
    return "; ".join(str(f.get("what") or f.get("kind") or f) for f in findings[:4])


# ---- register ---------------------------------------------------------------------------------

def _repo_root() -> str | None:
    try:
        out = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True,
                             text=True, timeout=5, cwd=os.path.expanduser("~/work"))
        return out.stdout.strip() or None
    except Exception:
        return None


def _register_paths() -> list[str]:
    """The agent's own work queue: repo WORKLOG.md if committed, else the home register, else none.

    A BYO-repo pod must never have agent bookkeeping written into the customer's tree: it would be
    committed, pushed into their PRs and history, and destroyed by an ordinary git checkout/clean.
    The codebase already made this exact call for scheduler state (pod-base/podway:407) because
    "BYO repos don't gitignore it".
    """
    root = _repo_root()
    if root:
        found = [os.path.join(root, n) for n in REPO_REGISTERS]
        found = [p for p in found if os.path.exists(p)]
        if found:
            return found
    return [HOME_REGISTER] if os.path.exists(HOME_REGISTER) else []


ITEM = re.compile(r"^\s*[-*]\s*\[ \]\s*(.+?)\s*$")


def _actionable() -> list[str]:
    """Unticked checklist items across the resolved registers.

    Fails SAFE: any read/parse problem yields an EMPTY list, so a broken register allows the stop
    rather than wedging the session on work nobody can see.
    """
    items: list[str] = []
    # Stranded work counts as actionable, and deliberately comes FIRST: a branch pushed with no PR
    # or an uncommitted tree is work this pod already did and walked away from, which is more urgent
    # than anything still sitting on a list. Cached and refreshed in the background, so reading it
    # costs a stat — see _stranded_note.
    stranded = _stranded_note()
    if stranded:
        items.extend(s.strip() for s in stranded.split(";") if s.strip())
    for path in _register_paths():
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    m = ITEM.match(line)
                    if m:
                        text = m.group(1)
                        # Strikethrough marks something already dealt with.
                        if text.startswith("~~"):
                            continue
                        items.append(re.sub(r"\*\*|`", "", text)[:160])
        except Exception:
            continue
    return items


# ---- consecutive-block accounting ---------------------------------------------------------------

def _user_turn_count(transcript: str) -> int:
    """How many user turns the transcript holds — the marker for 'the user has spoken since'."""
    n = 0
    try:
        with open(transcript, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if '"role":"user"' in line or '"role": "user"' in line:
                    n += 1
    except Exception:
        return -1
    return n


def _load_state() -> dict:
    try:
        with open(STATE, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def _save_state(d: dict) -> None:
    try:
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        with open(STATE, "w", encoding="utf-8") as fh:
            json.dump(d, fh)
    except Exception:
        pass


# ---- current turn -------------------------------------------------------------------------------

def _current_turn(path: str) -> str:
    """Only THIS turn's tool calls.

    A flat tail scan asked "has this happened recently?" when the policy is about this turn: one
    AskUserQuestion from an earlier turn silenced the hook for the rest of a session (measured
    2026-09-06). Do not regress this.
    """
    if not path or not os.path.exists(path):
        return ""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            lines = fh.readlines()
    except Exception:
        return ""
    start = 0
    for i in range(len(lines) - 1, -1, -1):
        if '"role":"user"' in lines[i] or '"role": "user"' in lines[i]:
            start = i
            break
    return "".join(lines[start:])


def _background_task_live(transcript: str) -> bool:
    """Is a background task actually running RIGHT NOW?

    The transcript LAGS. A task started as the last tool call of a turn is often not written when the
    Stop hook runs — measured 2026-09-06: the "current turn" held 3 lines and the run_in_background
    call was missing, so the hook blocked a turn that HAD ended legally with a build in flight. A
    false block is expensive: the agent cannot tell it from a real one, and it teaches that the wall
    is noise.

    The harness appends to <task-dir>/<id>.output while a task runs, so a file touched seconds ago is
    live work. The task dir is found from the SESSION ID in the transcript filename — never by
    globbing, which matched other sessions' tasks and made this allow everything (caught by a test
    that asserted the wall still blocks when nothing is running).

    Heuristic, so it only ever ALLOWS; it can never cause a block on its own.
    """
    try:
        session = os.path.basename(transcript or "").removesuffix(".jsonl")
        if not session:
            return False
        import glob
        hits = glob.glob(f"/tmp/claude-*/*/{session}/tasks/*.output")
        now = time.time()
        return any(now - os.path.getmtime(h) < 120 for h in hits)
    except Exception:
        return False


def _block(reason: str) -> None:
    print(json.dumps({"decision": "block", "reason": reason}))


def main() -> int:
    raw = sys.stdin.read()
    try:
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return ALLOW

    # The runtime's own infinite-loop protection has engaged. Blocking again deadlocks the session.
    if data.get("stop_hook_active") is True:
        return ALLOW

    if not _hold_enabled():
        return ALLOW

    transcript = data.get("transcript_path") or ""
    turn = _current_turn(transcript)

    # --- legal ending 1: a background task is running. Its completion re-invokes the agent.
    if '"run_in_background":true' in turn.replace(" ", "") or '"run_in_background": true' in turn:
        return ALLOW
    # The transcript may not have caught up with a task started moments ago — see the note on
    # _background_task_live. Checking the task output files covers that lag.
    if _background_task_live(transcript):
        return ALLOW

    # --- legal ending 2: the last thing done was a REAL fork the user must resolve. A prose
    # question is deliberately NOT this: it reads as finished work and nothing resumes on silence.
    if "AskUserQuestion" in turn:
        return ALLOW

    # --- legal ending 3: nothing actionable left. Deliberately reachable, never assumed.
    items = _actionable()
    if not items:
        return ALLOW

    # --- the escape. Count refusals since the user last spoke.
    state = _load_state()
    turns_now = _user_turn_count(transcript)
    same_turn = turns_now >= 0 and state.get("user_turns") == turns_now
    if not same_turn:
        streak = 0                      # the user has spoken (or we cannot tell) — start over
    else:
        # Once yielded, STAY yielded until the user speaks. Resetting the streak on yield made the
        # wall oscillate — three blocks, a yield, three more blocks — which is a loop wearing an
        # escape's clothes, and worse than no cap because the escape looks like it worked.
        if state.get("yielded") is True:
            return ALLOW
        streak = int(state.get("streak") or 0)

    if streak >= MAX_CONSECUTIVE_BLOCKS:
        _save_state({"user_turns": turns_now, "streak": streak, "yielded": True})
        _block(
            f"You have now been held {streak} times in a row with no reply from the user, so this "
            "hook is YIELDING rather than looping — a wall that cannot be escaped is worse than no "
            "wall. Before you stop: say plainly that work remains and name what is still open, so "
            "the user sees the state rather than a clean-looking ending."
        )
        return ALLOW

    _save_state({"user_turns": turns_now, "streak": streak + 1})

    top = items[0]
    more = f" ({len(items) - 1} more open)" if len(items) > 1 else ""
    _block(
        "This turn is ending without a legal ending: no background task is running, and your last "
        "tool call was not AskUserQuestion. Work is still open, so the stop is not earned.\n\n"
        f"NEXT ITEM: {top}{more}\n\n"
        "Do one of these NOW — (a) work the item above, or another open item if you judge it more "
        "valuable; (b) if a genuine fork blocks you, ask it with AskUserQuestion so it renders as "
        "selectable options, batching every pending question into that ONE call; or (c) start the "
        "work as a background task, which re-invokes you when it finishes. Writing a status report "
        "is not one of the options: it reads as finished work and the loop dies there."
    )
    return ALLOW


if __name__ == "__main__":
    sys.exit(main())
