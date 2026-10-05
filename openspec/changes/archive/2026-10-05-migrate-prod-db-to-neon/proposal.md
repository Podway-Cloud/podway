# Proposal — migrate prod DB to Neon

## Why
The prod control-plane Postgres ran on the Fly `podway-db` app: `shared-cpu-1x:256MB`, no swap,
single node, UNMANAGED (Fly warns unmanaged Fly Postgres is unsupported). Under a write burst — e.g.
running image updates on several pods — memory exhausted, the VM froze for seconds, and it DROPPED
live connections (`Better Auth: Failed to get session / Connection terminated unexpectedly`), which
hard-crashed the dashboard (error code 3914836991) on 2026-09-22. It could not be resized in place:
the Fly host in `fra` was full (1024/512/256 all refused, even with the machine stopped) and the
volume is pinned to that host.

## What
Move prod Postgres to **Neon** (managed, region AWS Frankfurt `eu-central-1`). Chosen over Fly
Managed Postgres purely on cost — MPG floor is $38/mo vs Neon free/~$19, and the DB is ~15 MB.
`DATABASE_URL` on `podway-web` + `podway-gateway` points at Neon's **direct** endpoint (not the
`-pooler` host), because both are long-running servers with their own pg pools; direct avoids
pgbouncer prepared-statement quirks and the connection count is low (~17 peak).

## Scope / non-goals
- In scope: back up, cut over web+gateway to Neon with zero data loss, verify, keep the old Fly DB
  as a short-lived rollback, then tear it down.
- Not in scope: schema changes; the dashboard graceful-degradation hardening (tracked separately in
  0audit); moving the self-host/OSS DB story (self-host stays on the owner's own Postgres).

## Impact
- Fixes the crash root cause. A few minutes of dashboard/gateway downtime during the write-freeze.
- Ongoing: Neon free tier fits today; ~$19/mo later for always-on (no cold starts).
