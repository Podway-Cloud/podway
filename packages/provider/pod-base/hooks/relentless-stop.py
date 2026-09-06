#!/usr/bin/env python3
"""Stop hook: enforce the relentless rule that a turn may not end on a prose question.

Every other part of relentless is a prompt asking the agent to remember. This is the only
piece that does not depend on the agent's momentum — and momentum is the documented failure
mode: an agent finishes something notable, writes a good summary, tacks "Want me to X?" on
the end, and the loop dies because a prose question reads as finished work and answering it
is optional. (Diagnosed independently by two agents on two pods before this existed.)

Policy — BLOCK the stop when ALL of:
  1. the final assistant message ends by asking the user something,
  2. the turn made no AskUserQuestion call (which renders selectable options), and
  3. no background task is in flight (whose completion would re-invoke the agent).
Anything else is allowed: those are the two legal endings.

Fails OPEN by design. A hook that crashes must never wedge a session, so any unexpected
error exits 0 and lets the stop through.
"""
import json
import re
import sys

ALLOW = 0


def main() -> int:
    raw = sys.stdin.read()
    try:
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return ALLOW

    # Never fight the loop-breaker: if the runtime has already engaged infinite-loop
    # protection, blocking again deadlocks the session.
    if data.get("stop_hook_active") is True:
        return ALLOW

    last = (data.get("last_assistant_message") or "").rstrip()
    if not last:
        return ALLOW

    if not _ends_by_asking(last):
        return ALLOW

    # SCOPED TO THIS TURN. The transcript LAGS for the final message, but tool calls made
    # earlier in the turn are already written — which is what we need.
    #
    # This used to scan a flat 400KB tail, which asked "has this happened RECENTLY?" when the
    # policy is about THIS turn. One AskUserQuestion anywhere in that window silenced the hook
    # for the rest of the session — measured live on 2026-09-06: a long session's tail held two
    # such calls from earlier turns, so a prose-question ending would have been allowed. That is
    # the reported symptom exactly ("sometimes I see it, most times I don't"): the hook fires
    # early in a session and goes blind once the agent has asked anything at all. Same hole for
    # background tasks — one completed hours ago kept excusing every later stop.
    turn = _current_turn(data.get("transcript_path") or "")
    if "AskUserQuestion" in turn:
        return ALLOW
    if '"run_in_background":true' in turn.replace(" ", "") or '"run_in_background": true' in turn:
        return ALLOW

    print(json.dumps({
        "decision": "block",
        "reason": (
            "You ended this turn with a question written in prose, with no AskUserQuestion "
            "call and no background task running. That is a stop, not an ask: it reads as "
            "finished work, answering is optional, and nothing resumes if the user says "
            "nothing. Do ONE of these now — (a) if the fork is real, ask it with the "
            "AskUserQuestion tool so it renders as selectable options, batching every "
            "pending question into that one call; or (b) if you can make progress without "
            "the answer, keep working and ask later. Do not simply restate the question."
        ),
    }))
    return ALLOW


def _ends_by_asking(text: str) -> bool:
    """Is the message's closing move a question aimed at the user?"""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if not lines:
        return False

    # A trailing '?' only counts as the CLOSING MOVE when it is actually at the end — a question
    # mid-report is narration, not an ask.
    if " ".join(lines[-3:]).endswith("?"):
        return True

    # Solicitation PHRASES get a wider window, because the common evasion is to ask and then keep
    # typing: "Want me to deploy?" followed by a status board scrolled the ask out of a 3-line tail
    # and the turn ended anyway. That was the agent's most frequent ending shape on 2026-09-06 —
    # measured, not assumed. These phrasings are safe to scan further back: unlike '?', they barely
    # occur except when soliciting a decision, so the wider window costs little precision.
    return bool(re.search(
        r"\b(let me know|tell me which|say the word|your call|want me to|shall i|should i|"
        r"do you want|would you like|which (one|would you)|confirm and i|"
        r"if you'?d rather|tell me and i|and i'?ll (ship|do|run|take)|ready when you)\b",
        " ".join(lines[-15:]), re.IGNORECASE))


def _current_turn(path: str) -> str:
    """The transcript since the last USER message — i.e. what happened in this turn.

    Read a generous tail and cut at the final user-role entry. Falls back to the whole tail when
    no user entry is found (a very long turn): erring toward ALLOW keeps the hook fail-open, which
    matters more than catching every case — a hook that wrongly blocks is worse than one that
    wrongly permits, because the agent cannot proceed at all.
    """
    tail = _tail(path, 2_000_000)
    if not tail:
        return ""
    last = -1
    for m in re.finditer(r'"role"\s*:\s*"user"', tail):
        last = m.start()
    return tail[last:] if last >= 0 else tail


def _tail(path: str, nbytes: int) -> str:
    if not path:
        return ""
    try:
        with open(path, "rb") as fh:
            try:
                fh.seek(-nbytes, 2)
            except OSError:
                fh.seek(0)
            return fh.read().decode("utf-8", "replace")
    except OSError:
        return ""


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:  # never wedge a session on a hook bug
        sys.exit(ALLOW)
