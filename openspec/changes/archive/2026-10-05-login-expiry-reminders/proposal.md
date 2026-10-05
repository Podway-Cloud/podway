## Why

A Claude subscription login hard-expires about every 30 days and nothing on the pod can extend it. Today
the only warning is a dashboard ribbon from 7 days out — an owner who does not open the dashboard finds
out when their agent stops. Owners should hear in time, through channels they actually see (email, and
their own agent in chat), with one link straight to the reconnect wizard.

## What Changes

- Schedule (owner decision 2026-09-25) for a Claude **subscription** login:

  | before expiry | dashboard | pod message | email |
  |---|---|---|---|
  | 7 days | ribbon (exists) | yes | — |
  | 3 days | ribbon | yes | yes |
  | 2 days | ribbon | yes | yes |
  | 1 day | red ribbon | yes | yes |
  | expired | "Sign-in expired" | yes | yes |

- A setup-token (1-year, T3) login: email + pod message at 14 and 3 days, and on expiry. API keys: none.
  Codex has no expiry date: one email + pod message when its login fails (`needs-login`, not `never`).
- An unexpected sign-out (`needs-login` `rejected`/`expired` before the date) sends the "expired" notice
  at once.
- Every link opens `…/dashboard/pods/<slug>?tab=control&wiz=reconnect:<agent>`.
- ONE email per owner per threshold, listing all their affected pods. Stops as soon as the expiry moves
  forward (reconnected). Each (pod, agent, expiry, threshold) is sent at most once, across restarts.
- The pod message is a system message; the runtime rules tell the agent to mention it ONCE, at the next
  natural point in the conversation, with the link — never every turn.
- Owners can turn reminder EMAILS off in account settings (the dashboard and pod message stay).

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-credentials`: login-expiry reminders across dashboard, pod message and email.

## Impact

- DB (two-edition, backward-compatible): nullable `pods.claude_login_expires_at`; new
  `auth_notices(pod_id, agent, expires_at, threshold, sent_at)` unique on the first four; nullable
  `user.reminder_emails` (default on). Gateway deploys before web.
- control-plane: reconcile persists the expiry; an hourly reminder sweep (gateway, like dunning).
- web: 1-day red ribbon; account setting toggle.
- Depends on `email-templates` for the email layout. Self-host: pod message + dashboard; email only when
  Gmail is configured.
