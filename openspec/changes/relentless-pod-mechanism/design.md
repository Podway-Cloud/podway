## Context

The `Stop` hook is the ONLY enforcing part of relentless. Everything else — `CLAUDE.md`, the
`relentless` rule file, the `relentless` skill — is advisory text, and advisory text loses to the
model's strongest prior (*answer, then yield*), increasingly so as context grows. Measured mid-session
on this pod, 2026-09-06: **748 of ~1508 assistant turns ended as plain stops**, during a session whose
subject was fixing relentless.

Current hook (`packages/provider/pod-base/hooks/relentless-stop.py`, ~134 lines): reads the Stop
payload on stdin, returns ALLOW unless the last assistant message *ends by asking* in prose AND the
current turn contains neither `AskUserQuestion` nor a `run_in_background` tool call. It already gets
two things right that this design keeps:

- it scopes its scan to the CURRENT turn (`_current_turn()`), after a flat 400KB tail let one old
  `AskUserQuestion` silence the hook for a whole session;
- it honours `stop_hook_active`, the runtime's own infinite-loop protection.

What it gets wrong is its default. Allow-by-default means the hook only ever catches the one shape
someone thought to describe.

## Goals / Non-Goals

**Goals:**

- Make continuing the default and stopping the thing that must be earned, by enforcement rather than
  instruction.
- When a stop is refused, hand the agent the NEXT ACTIONABLE ITEM, not a scolding.
- Work on ANY pod, including a BYO repo the agent must not write bookkeeping into.
- Be switchable per pod, with the money-spending half switchable separately.
- Never wedge a session, and never spend the owner's money without a bound.

**Non-Goals:**

- Making the agent work when there is genuinely nothing to do. The value floor stands: manufacturing
  work is worse than idling, because it looks like progress.
- Replacing `AskUserQuestion`. A real fork must still reach the owner; the monitor deliberately does
  NOT nudge a pod that is waiting on them.
- Editing the advisory text again. It is not load-bearing; adding more of it is the failure mode this
  change exists to stop repeating.

## Decisions

### D1 — Invert the default

A stop is ALLOWED only when one is provable from the payload or the filesystem:

1. **A background task is running.** Detected as today, from the current turn's tool calls
   (`run_in_background: true`). Its completion re-invokes the agent, so the loop genuinely continues.
2. **The last tool call was `AskUserQuestion`.** Scoped to the current turn. A prose question at the
   bottom of a report is NOT this, which is the whole point.
3. **The register holds no actionable item.** A deliberately reached idle state.

Anything else blocks. The refusal message names the top actionable item.

Rejected: keeping allow-by-default and adding more blocked shapes. That is what exists, and it
catches only what someone thought to enumerate — two fires against 748 stops.

### D2 — Register resolution, repo-safe by default

In order:

1. `0asks.md` / `0audit.md` in the repo root, **if present**. Preserves this repo's behaviour and lets
   a team opt in deliberately.
2. `~/.podway/register.md` otherwise. Outside git, on the persistent volume, never in a customer tree.
3. Neither, and nothing stranded → **no actionable work** → allow the stop.

This follows a decision the codebase already made for scheduler state
(`packages/provider/pod-base/podway:407`), which moved out of `~/work` because *"BYO repos don't
gitignore it"* and a `git checkout`/`clean` could clobber it. The same three failure modes apply to a
register: it would be committed into the customer's tree, pushed into their PRs and history, and
destroyed by ordinary git operations.

Rejected: **always** writing the register into the repo — unacceptable for BYO. Rejected: **always**
writing it to home — loses the reviewable, PR-visible, outlives-the-pod register this repo depends on,
since home survives a restart but not pod deletion.

Noted for later, deliberately NOT in this change: storing the register in the platform DB and
surfacing it in the cockpit. That is the strongest product answer — the owner would see what needs
them without reading terminal scrollback, which is the actual problem `0asks.md` exists to solve —
but it needs schema, API, UI and a `podway` CLI writer. It should not gate the hook fix.

### D3 — Two switches, delivered by the spec file

`~/.podway-pod-spec.json` already carries per-pod platform config into the pod (`agents`,
`permissions`, `lifecycle`, `network`, `setup`, …) and is rewritten on boot and on config refresh.
The flags ride it; the hook reads them at run time, so a change takes effect without a rebuild.

- `relentless.hold` — the hook. **Free**: it refuses a stop, it never starts a turn.
- `relentless.wake` — the monitor. **Billed**: every nudge is an agent turn.

One toggle for both would hide a bill behind a behaviour switch. A missing/unparseable file means
**off** — a pod must never inherit an enforcement wall by accident.

**The spec file is PLATFORM-OWNED, and that is not a detail.** It is rewritten on boot and on every
config refresh, so anything hand-set there disappears without warning. Proven during the first trial
of the inverted hook on 2026-09-04..06: the flag was set by hand, the spec was rewritten at 14:31,
the key vanished with it, and the wall went OFF silently — the hook then allowed a stop it should
have blocked, and nobody noticed until the register was checked against the hook's own decision.

Two consequences the implementation must honour:

- the flag MUST be delivered by the control plane into the spec, never set in place on the pod; and
- a **local override** (`~/.podway/relentless.json`, checked FIRST) is needed so a pod can be put
  under the wall durably before that delivery exists — and afterwards, as the honest place for an
  override the platform does not manage.

A silent disarm is the worst failure mode available here: it looks exactly like a working wall that
simply had nothing to block.

### D4 — Loop safety

Three independent bounds, because this is the one change here that can wedge a session:

- `stop_hook_active` — never block when the runtime's own loop-breaker has engaged.
- **Consecutive-block cap**: after N refusals with no intervening user turn, the hook yields and says
  it is yielding and why. A wall that cannot be escaped is worse than no wall.
- The register itself: an empty register is a legal, reachable stop, so the normal exit is a real
  state rather than an escape hatch.

### D5 — The monitor is a second layer, not a duplicate

The hook cannot act once a session has ENDED — nothing is left to hook. That gap is the monitor's
entire job, and it is why the two are not redundant.

It runs in the gateway maintenance sweep (already periodic, already fleet-wide, already exactly one
machine) beside `reconcileStuckUpdates`. It reuses `deriveState()`
(`apps/web/lib/pod-visual-state.ts`), which already classifies every pod as
`Working`/`Idle`/`Waiting for you`/`Needs you` — no new detection is needed.

Conditions and rejected alternatives are enumerated in the proposal. The one worth restating here,
because getting it wrong would be actively harmful: **a pod in `Waiting for you` is never nudged.**
That state means the agent asked the owner something. Nudging it would train the agent to work around
the human, which is the opposite of the intent.

## Risks / Trade-offs

- **A wedged session.** Block-by-default is the risky part. Mitigated by D4's three bounds, by
  shipping behind an off switch that defaults off, and by proving it on this pod before it reaches the
  image. The `loose-ends` job this session is the cautionary case: a fleet-wide behaviour whose
  instructions were subtly wrong alarmed every pod daily, and pods could not even discover what it
  was.
- **Cost.** The monitor spends billed turns by design. Bounded by the value floor (condition 5),
  a cooldown, and a per-pod daily cap — and switchable off independently.
- **A register that lies.** If the hook reads a stale or wrong register it will refuse stops for work
  that is already done. The register formats are ours (`0asks.md` ticked items) but the parse must
  fail SAFE: on any parse error, treat the register as empty and allow the stop.
- **Edition parity.** The gateway sweep is cloud-only. Self-host must get its own path or an honest
  no-op, or this becomes a silently cloud-only behaviour on a shared surface.
- **Not being enough.** This change asserts that enforcement beats instruction. If plain stops do not
  measurably drop on this pod, the diagnosis is wrong and the next step is data, not more text. The
  same turn-ending measurement used in the proposal is the check.
