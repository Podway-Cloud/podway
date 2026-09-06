## Why

Relentless does not work. Measured on this pod, 2026-09-06, mid-session: of ~1508 assistant turns,
**748 ended as a plain stop** — no question asked, no background task running, work still queued.
About half. And that was during a session whose explicit subject was fixing relentless.

The owner's read is correct: the agent behaves as though it is looking for permission to stop.
That is not defiance, it is the mechanism. The single most reinforced behaviour a chat model has is
*answer, then yield to the human*. Every rule that says "do not stop" is one sentence arguing with
that prior, and it loses — sooner as context grows, because a rule is read once at session start and
then competes with everything after it.

So the diagnosis is: **advisory text cannot fix this. Only enforcement can.**

Today there is exactly one enforcing part — the `Stop` hook — and it is nearly toothless:

- It is **allow-by-default**. It blocks ONE narrow shape: a message that ends in a prose question
  with no `AskUserQuestion` and no background task. Everything else passes.
- So "here is my status report", "done, tests pass", and finishing one item with thirty still open
  in `0asks.md` are all allowed stops.
- Against 748 plain stops in the measured session, it fired roughly twice.

Two further problems this change also settles, both raised by the owner:

1. **There is no off switch.** Relentless is currently unconditional on every pod carrying the
   image. It costs real money (each wake is a billed turn) and it is not wanted on every pod.
2. **The work register lives in the user's repo.** `0asks.md` / `0audit.md` sit in `~/work`. That is
   fine for Podway's own repo and wrong for a BYO-repo pod, where agent bookkeeping would be
   committed into the customer's tree, pushed into their PRs and history, and clobbered by a
   `git checkout`/`clean`. The codebase has ALREADY made this exact call once, for scheduler state:
   `packages/provider/pod-base/podway:407` moved it out of the working tree because *"BYO repos
   don't gitignore it"*. The register must follow the same reasoning.

## What Changes

### 1. Invert the Stop hook: block by default, earn the stop

The hook stops asking *"is this stop bad?"* and starts asking **"has this stop been earned?"**

A stop is allowed ONLY when one is provably true:

- a background task is genuinely running (its completion re-invokes the agent), or
- the last tool call was `AskUserQuestion` (a real, selectable fork the user must resolve), or
- the work register holds **no actionable item**.

Otherwise the hook blocks — and when it blocks it **names the next actionable item** read from the
register, rather than issuing a generic "keep working". This matters: a generic nudge is exactly the
gap the agent fills with another status report. Handing it the next item removes the excuse.

Safety, because a block-by-default wall can loop and a looping pod costs money:

- honour the existing `stop_hook_active` guard (the runtime's own loop-breaker) — never fight it;
- a consecutive-block cap, after which the hook yields and says why;
- an idle state that is **reached deliberately** (register empty) rather than fallen into.

### 2. A relentless on/off setting, per pod

Surfaced in the cockpit and carried into the pod by the mechanism that already exists:
`~/.podway-pod-spec.json` already delivers per-pod platform config (`agents`, `permissions`,
`lifecycle`, `network`, …). The hook reads the flag from there. No new channel.

**Two switches, not one** — because the two halves have different costs, and hiding that under a
single toggle hides a bill:

- **Do not let me stop mid-work** (the hook). Free: it refuses a stop, it does not start a turn.
- **Wake me when I am idle** (the monitor, below). Each wake is a **billed turn**.

A user may reasonably want the first without the second. Bundling them is a cost surprise.

### 3. The work register becomes pod-wide and repo-safe

Resolution order, so BYO pods are safe by DEFAULT and Podway's own repo keeps what it has:

1. a committed register in the repo (`0asks.md` / `0audit.md`) — used when present, which preserves
   today's behaviour for this repo and any team that deliberately opts in;
2. otherwise `~/.podway/register.md` in home — outside git, survives restarts, never enters the
   customer's tree;
3. if neither exists and nothing is stranded, there is **no actionable work**, and the stop is
   allowed. This is the value floor: never manufacture work to look busy.

### 4. An idle-pod monitor (design here; build gated on the hook proving out)

Runs in the **gateway maintenance sweep** — already periodic, already fleet-wide, already exactly
one machine, alongside `reconcileStuckUpdates`. No new infrastructure, and a fleet view a per-pod
cron cannot have.

It nudges a pod only when ALL hold:

| # | Condition | Why |
|---|---|---|
| 1 | status `running` | Never wake a **suspended** pod — that is the owner's explicit choice, and waking it spends their money against it. |
| 2 | activity is `Idle` | `Working` needs nothing. |
| 3 | NOT `Waiting for you` / `Needs you` | The agent asked the OWNER something. Nudging here teaches it to talk past them — it would destroy the behaviour we want. |
| 4 | idle past a threshold | A real stop, not a gap between tool calls. |
| 5 | register has actionable work | The value floor. Busywork looks like progress and is worse than idling. |
| 6 | cooldown + per-pod daily cap | Each nudge is billed; a pod that ignores nudges must not be hammered. |

The agent-activity signal needs no new detection: `deriveState()` in
`apps/web/lib/pod-visual-state.ts` already computes `Working`/`Idle`/`Waiting for you`/`Needs you`
for every pod card.

Rejected alternatives, recorded so they are not re-proposed:

- **A daily cron inside the pod** (proposed by the agent earlier this session, and rightly rejected
  by the owner as "half stupid"): it fires blind, cannot see whether the agent is idle, needs
  per-pod setup, and answers "notice stranded work later" when the problem is "do not stop now".
  Wrong layer entirely.
- **Nudge every idle pod** — manufactures busywork.
- **Nudge pods that are waiting on the owner** — trains the agent around the human.
- **Let the monitor act directly** (open the PR itself) — two actors on one repo; it should wake the
  agent, not replace it.
- **A tight cadence** — real money across a fleet for little gain.

## Capabilities

### New Capabilities
- `relentless`: the enforced continuous-work mechanism — the block-by-default Stop hook, the
  per-pod on/off settings, the repo-safe work register, and the idle-pod monitor that covers the
  case a hook physically cannot (the session already ended).

### Modified Capabilities
- `pod-boot`: the pod spec gains the relentless flags, and the boot/refresh path delivers them.
- `control-plane`: the maintenance sweep gains the idle-pod nudge, with its conditions and caps.
- `dashboard`: the cockpit gains the settings rows for the two switches.
- `self-host`: edition parity — the gateway sweep is cloud-only, so self-host needs its own path or
  an honest no-op rather than a silently cloud-only feature on a shared surface.

## Impact

- `packages/provider/pod-base/hooks/relentless-stop.py` — inverted, register-aware, capped.
- `packages/provider/pod-base/` — pod-spec flags; `refresh-common.sh` delivery.
- `packages/control-plane/src/service.ts` — the idle nudge in the maintenance sweep.
- `packages/db` — settings persistence for the two flags (nullable, backward-compatible).
- `apps/web` — cockpit settings rows.
- Cost: the monitor spends billed turns by design. Caps and the value floor are what bound it.
- Risk: a block-by-default wall is the one change here that can wedge a session. It ships behind the
  off switch, and is proven on this pod before it reaches the image.
