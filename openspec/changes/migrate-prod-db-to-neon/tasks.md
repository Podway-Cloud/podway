# Tasks — migrate prod DB to Neon

## 1. Prep + backup
- [x] 1.1 Confirm root cause: `podway-db` 256MB/no-swap, host full, can't resize (verified all sizes refused).
- [x] 1.2 Owner decision: Neon (cost — MPG floor $38/mo vs Neon free/~$19 for a 15MB DB).
- [x] 1.3 Backup source with PG18 `pg_dump` (plain SQL, gzip) → `~/podway-dump*.sql.gz`; verify (24 tables, 0 extensions, complete).
- [x] 1.4 Save rollback `DATABASE_URL` → `/home/dev/rollback-DATABASE_URL.txt`.

## 2. Target
- [x] 2.1 Inspect Neon `neondb`: found an OLD 10-table Podway dataset. Owner confirmed junk.
- [x] 2.2 CSV-backup the junk (`~/neondb-junk-backup/`), then `drop schema public/drizzle cascade; create schema public;`.

## 3. Zero-loss cutover
- [x] 3.1 Freeze: `fly machine stop` podway-web + podway-gateway.
- [x] 3.2 Fresh frozen dump → restore into Neon (`ON_ERROR_STOP=1`, 0 errors).
- [x] 3.3 Verify exact row-count match vs frozen source (pods 17, pod_events 4060, pod_secrets 112, account 8, session 62; 24 tables).
- [x] 3.4 `fly secrets import --stage` DATABASE_URL (Neon direct) on gateway then web → `fly secrets deploy` each → start.
- [x] 3.5 Verify each app's running DATABASE_URL host = Neon.

## 4. Verify live
- [x] 4.1 dashboard 307, signin 200, `verified=true` sessions on both apps.
- [x] 4.2 gateway `relay_connected` + pod `ws_accepted`; all 4 recently-updated pods consistent (box == DB == 0.8.31).

## 5. Teardown (owner "go" — see 0asks)
- [ ] 5.1 Destroy `podway-db-backup` (suspended, dead weight) — safe now.
- [ ] 5.2 After a few stable days on Neon: `fly apps destroy podway-db`; keep `~/podway-dump*.sql.gz` + CSVs until then.
- [ ] 5.3 Re-point stale docs from `podway-db` to Neon: `docs/runbooks/agent-ops-access.md`, `scripts/check-migrations.sh`, shipping/deploy runbooks.
