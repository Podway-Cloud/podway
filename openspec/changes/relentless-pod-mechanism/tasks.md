## 1. Prove the diagnosis before building on it

- [ ] 1.1 Record the CURRENT plain-stop rate on this pod from the session transcript (baseline was
      748 of ~1508 turns, 2026-09-06). The same measurement is the acceptance check later — if the
      rate does not drop, the diagnosis is wrong and the answer is data, not more advisory text.

## 2. The register (do this first — the hook depends on reading it)

- [x] 2.1 Resolver: repo `0asks.md`/`0audit.md` if present → `~/.podway/register.md` → none.
- [x] 2.2 Parse actionable items: unticked `- [ ]` entries; ticked and struck items are not actionable.
- [x] 2.3 Fail SAFE: missing, malformed or unreadable register → treat as empty → allow the stop.
- [x] 2.4 Unit tests, including a BYO-shaped repo with no committed register.

## 3. Invert the Stop hook

- [x] 3.1 Flip the default to block; allow only on background task, `AskUserQuestion`, or empty register.
- [x] 3.2 Keep `_current_turn()` scoping — a flat tail let one old `AskUserQuestion` silence the hook
      for a whole session; do not regress that.
- [x] 3.3 Refusal message names the top actionable item, not a generic "keep working".
- [x] 3.4 Consecutive-block cap: after N refusals with no intervening user turn, yield and SAY so.
- [x] 3.5 Keep honouring `stop_hook_active`; never fight the runtime's loop-breaker.
- [x] 3.6 Tests for every branch, each asserting the DECISION (block/allow), including the escape.

## 4. The two switches

- [x] 4.1 Add `relentless.hold` / `relentless.wake` to the pod spec written to `~/.podway-pod-spec.json`.
- [x] 4.2 Hook reads them at run time (no rebuild to change) and treats missing/unparseable as OFF.
- [x] 4.2a Check a LOCAL override (`~/.podway/relentless.json`) FIRST. The spec file is
      platform-owned and rewritten on every config refresh — a hand-set flag there vanished
      mid-trial on 2026-09-06 and the wall went off silently, which is the worst failure mode
      available: it looks identical to a working wall with nothing to block.
- [x] 4.3 Persist both per pod (nullable columns, backward-compatible, gateway deploys before web).
- [x] 4.4 ONE `SettingRow` ("Agentic behavior") whose DESCRIPTION carries the current state, opening a
      dialog with the two switches — owner's call, and better than the status-line-inside-the-modal
      idea it replaced: the state is legible without opening anything, which is what this mechanism's
      silent failures actually need. The wake switch names its billed-turn cost in the dialog.
- [ ] 4.5 Deliver on config refresh, not only on boot.

## 5. Prove it HERE before it reaches the image

- [ ] 5.1 Run with the inverted hook live on this pod for a day.
- [ ] 5.2 Re-measure the plain-stop rate against 1.1.
- [ ] 5.3 Confirm no wedged session: the cap fires and yields as designed.
- [ ] 5.4 Only then build it into pod-base. The `loose-ends` job is the cautionary case — a fleet-wide
      behaviour whose instructions were subtly wrong alarmed every pod daily and could not even be
      identified by the pods receiving it.

## 6. The monitor (gated on 5 passing)

- [ ] 6.1 Idle-pod nudge in the gateway maintenance sweep, beside `reconcileStuckUpdates`.
- [ ] 6.2 Reuse `deriveState()` for activity; add NO new detection.
- [ ] 6.3 Enforce all six conditions, especially: never nudge `Waiting for you`/`Needs you`, and never
      nudge a suspended pod.
- [ ] 6.4 Cooldown + per-pod daily cap; the nudge names the top item rather than saying "continue".
- [ ] 6.5 Self-host path or an honest no-op — the sweep is cloud-only and this is a shared surface.
- [ ] 6.6 Tests: each condition proven to BLOCK a nudge on its own.

## 7. Close out

- [ ] 7.1 Update `openspec/specs/relentless/` and the modified capabilities.
- [ ] 7.2 Record in `0audit.md` anything deferred, and in `0asks.md` anything only the owner can do.
- [ ] 7.3 Delete the advisory text this change makes redundant, rather than leaving two sources of
      truth — the rule files describe behaviour the hook now enforces.
