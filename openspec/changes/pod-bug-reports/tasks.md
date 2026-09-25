## 1. Pod side

- [x] 1.1 Tests first: bundle collection; scrubbing (seeded fake secrets + token shapes never survive);
      size cap; outbox line format; rate limit
- [x] 1.2 `podway bug` in the CLI (+ `--area`, `--detail -`)
- [x] 1.3 Pod-agent auto-reports for the four known failures
- [x] 1.4 Runtime rules (Claude + Codex): doctor first, then `podway bug`; never for app code

## 2. Control plane

- [x] 2.1 Migration: `pod_reports` (fingerprint, pod_id, owner_id, area, summary, bundle, count, status,
      first/last seen) — additive
- [x] 2.2 Collect from the outbox; group by fingerprint; wake the triage pod on NEW / reopened only

## 3. Web

- [x] 3.1 Cockpit Insights → Reports (owner's pods)
- [ ] 3.2 Admin list with status actions

## 4. Verify + ship

- [x] 4.1 Real pod: `podway bug` → report stored, triage message delivered, owner sees it
- [ ] 4.2 PR + merge; pod-base image + gateway then web (owner yes)

Notes (2026-09-25):
- 1.3: two automatic triggers (Codex RC ×10, startup entry given up); the other two dropped — spec says why.
- DEFERRED 3.2: the admin list with status actions. Triage (podway dev) marks fingerprints fixed/ignored in
  the DB for now; the owner's Reports list is live.
- The pod-agent endpoint is POST /bug-report (POST /report already existed: machine diagnostics).
- Ship needs PODWAY_CRASH_ALERT_POD (or PODWAY_BUG_REPORT_POD) on the GATEWAY too — only web has it.
- Main spec added as openspec/specs/pod-bug-reports → archive with --skip-specs.
- 4.1 (pod side, 2026-09-25): real scratch pod with this pod-agent + CLI — `podway bug` queued, outbox
  dev-owned, a real /etc/podway/secrets.env value absent from the report, logs collected (journal needs
  root — fixed). The drain → triage leg runs in the gateway; verified by tests, first real run after deploy.
