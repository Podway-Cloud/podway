## Context

`expiresAt` (Claude `refreshTokenExpiresAt`) is on each agent in `/healthz`; the gateway's reconcile sweep
already reads every pod's health every 90s, and a daily dunning sweep already emails owners
(`sendDunningEmail`). System messages to a pod exist (`AgentMessages.route`, sender `podway`). The web
shows a 7-day ribbon from live signals only.

## Goals / Non-Goals

**Goals:** timely, non-spammy, idempotent reminders on three channels; one link to the fix.

**Non-Goals:** auto-renewing a login (impossible — hard expiry); SMS/push; Codex expiry prediction (no
date exists).

## Decisions

- **Persist the expiry during reconcile** (`pods.claude_login_expires_at`), so the reminder sweep reads
  the DB hourly instead of probing pods. Updated whenever healthz reports a different value.
- **Idempotency by table, not by timestamps**: `auth_notices` unique (pod, agent, expires_at, threshold).
  A renewal changes `expires_at`, so old thresholds can never fire for the new login — "stop when fixed"
  falls out for free.
- **Threshold math**: a threshold fires once `now >= expires_at - threshold`; if the sweep missed an
  earlier threshold (gateway down), send only the most urgent unsent one, never a burst.
- **Batch per owner**: one email per owner per sweep, grouping pods at the same threshold.
- **Pod message copy** is written for the agent to relay: "Claude's login on this pod expires in 3 days.
  Reconnect: <link>". Runtime rules: mention once, at a natural point.
- **Quiet hours**: none in v1 (email is async); pod message delivery is already on the pod's poll.

## Risks / Trade-offs

- Noise (5 touches over 7 days) → emails only from 3 days, one per owner, stop on reconnect, opt-out.
- A wrong expiry (CLI rewrites the credential without `refreshTokenExpiresAt`) → no expiry = no reminder;
  the live `needs-login` path still sends the "expired" notice.
- Migration on both editions → nullable/additive only; gateway before web.
