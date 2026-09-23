# Design — migrate prod DB to Neon

## Connection wiring
- `DATABASE_URL` (Fly secret on `podway-web` and `podway-gateway`) → Neon **direct** endpoint
  `ep-icy-feather-asjajxci.c-4.eu-central-1.aws.neon.tech`, db `neondb`, `sslmode=require`.
  The `-pooler` host is deliberately NOT used (long-running server pools; avoid pgbouncer quirks).
- Secrets on the dev pod: `NEON_DATABASE_URL` (pooled, as pasted), `NEON_API_KEY`. Load with
  `source <(podway secrets env)`; never echo values.
- Migrations still apply via the gateway `release_command` on deploy — now targeting Neon.

## Zero-loss cutover method
1. Backup with the source machine's **PG 18** `pg_dump` (`/usr/lib/postgresql/18/bin/pg_dump`,
   `PGPASSFILE=/data/.pgpass -U repmgr -d podway`, plain SQL + gzip). The local pod's pg_dump is 16
   and refuses a newer server, so dump on the source. Saved to `~/podway-dump*.sql.gz`.
2. Freeze writes: `fly machine stop` both `podway-web` and `podway-gateway`.
3. Fresh dump (frozen) → on Neon `drop schema public/drizzle cascade; create schema public;` →
   `zcat dump | psql "<neon-direct>" -v ON_ERROR_STOP=1`.
4. Verify: 24 tables + exact row-count match vs the frozen source.
5. Cut over: `printf 'DATABASE_URL=%s\n' "$URL" | fly secrets import --stage -a <app>` (gateway then
   web) → `fly secrets deploy -a <app>`. NOTE: a plain `machine start` does NOT apply staged
   secrets — `secrets deploy` is required. Verified each app's running `DATABASE_URL` host = Neon.
6. Verify live: dashboard 307, signin 200, `verified=true` sessions on both apps, gateway
   `relay_connected` + a pod `ws_accepted`.

## Neon target note
`neondb` already held an OLD 10-table Podway dataset (an earlier dogfood). Owner confirmed it junk;
CSV-backed it up first, then overwrote. New prod is a clean restore of the live 24-table DB.

## Rollback
Old Fly `podway-db` kept running. Rollback = re-import the saved URL
(`/home/dev/rollback-DATABASE_URL.txt`) onto gateway + web, then `fly secrets deploy`. Writes made
to Neon after cutover would be lost on rollback, so roll back promptly or re-sync first.

## Gotchas
- pg driver warns `sslmode=require` is treated as `verify-full` (stricter; fine).
- Stale references to the old host to fix opportunistically: `docs/runbooks/agent-ops-access.md`,
  `scripts/check-migrations.sh`, shipping/deploy runbooks (all say `fly proxy -a podway-db`).
