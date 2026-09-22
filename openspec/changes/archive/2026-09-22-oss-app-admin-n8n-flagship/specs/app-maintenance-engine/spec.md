## ADDED Requirements

### Requirement: An app-pod ships a maintenance script with atomic snapshot and rollback

An app-pod's environment (n8n first) SHALL ship a maintenance script (`bin/app-admin.sh`) that the
always-on admin agent drives instead of running raw `docker compose` commands. It SHALL support
`deploy`, `status`, `snapshot`, `safe-upgrade <tag>`, and `restore <snapshot-dir>`. A `snapshot`
SHALL capture the app's database (a `pg_dump`), its named data volume (a tar archive), and the
`.env` file (which carries the image tag and any encryption/secret key) as one atomic unit so a
`restore` can bring code and data back together, consistent with each other. `safe-upgrade` SHALL
pull the target image BEFORE touching the running stack (so a bad or missing tag fails with nothing
changed), snapshot, apply the upgrade, health-check the result, and AUTOMATICALLY roll back to the
pre-upgrade snapshot (code and data together) when the new version does not come up healthy within
its health-check window.

#### Scenario: A snapshot captures code, data, and secrets as one unit

- **WHEN** `bin/app-admin.sh snapshot` runs
- **THEN** it SHALL write the database dump, the data volume archive, and the current `.env`
  (image tag + keys) into one timestamped snapshot directory, and print that directory's path

#### Scenario: A failed upgrade rolls back automatically

- **WHEN** `bin/app-admin.sh safe-upgrade <tag>` pulls and applies a target image that does not
  become healthy within the health-check window
- **THEN** the script SHALL restore the pre-upgrade snapshot (code and data together) and report
  the stack as rolled back and healthy, or report a distinct manual-attention failure if even the
  rollback does not come up healthy

#### Scenario: A bad target tag changes nothing

- **WHEN** `bin/app-admin.sh safe-upgrade <tag>` is given a tag that fails to pull
- **THEN** the running stack SHALL be left unchanged (the image reference reverted) and no snapshot
  action SHALL have altered the live app

### Requirement: A wrong encryption/secret key is refused, never silently applied

Where an app-pod's app has a stored secret whose value must stay constant across the app's lifetime
(n8n's `N8N_ENCRYPTION_KEY`, which decrypts every stored credential), the maintenance script SHALL
pin that value's hash on first deploy and SHALL REFUSE `deploy`, `safe-upgrade`, and `restore`
whenever the current or a restored `.env` carries a different value, rather than proceeding and
leaving the app looking healthy while every credentialed integration silently breaks.

#### Scenario: A mismatched key blocks the operation

- **WHEN** `deploy`, `safe-upgrade`, or `restore` runs and the operative `.env`'s key does not match
  the pinned hash from first deploy
- **THEN** the script SHALL refuse with a non-zero exit and an explanation, and SHALL NOT start or
  restart the app against the mismatched key

#### Scenario: An empty key is refused rather than auto-generated

- **WHEN** the key guard runs and `.env` carries no key value
- **THEN** the script SHALL refuse rather than let the app auto-generate a throwaway key that would
  orphan any already-encrypted data
