# cloudflare-dns-auto-setup Specification

## Purpose
For a custom domain whose zone is on Cloudflare, the owner clicks "Connect Cloudflare", consents on Cloudflare's OAuth screen, and the platform writes the domain's required DNS records (the CNAME to the podway edge and the `_podway-challenge` ownership TXT) for them — no API token, no hand-copying. The OAuth access token is used server-side once and dropped. Manual DNS records stay the universal fallback for every provider. Cloud edition only.

## Requirements

### Requirement: Connecting Cloudflare writes the custom domain's records automatically

After the owner authorizes Podway via **Cloudflare OAuth** (a consent screen granting DNS-edit access to the account/zone they pick), the platform SHALL create (or update) the two records a custom domain needs — the CNAME to the podway edge and the `_podway-challenge` ownership TXT — in that zone, so the owner never adds records by hand. The owner SHALL NOT be asked to create or paste an API token. The CNAME SHALL be written with proxying DISABLED (DNS only); a proxied CNAME breaks HTTPS issuance. The operation SHALL be idempotent: an existing matching record (same name and type) is updated, not duplicated, so re-running is safe. Cloud edition only.

#### Scenario: One-click writes the records after consent

- **WHEN** the owner clicks "Connect Cloudflare", approves the requested DNS scope on Cloudflare's consent screen, and the domain's zone is on the chosen account
- **THEN** the CNAME (DNS only) and the ownership TXT SHALL be present in the zone afterward, and the wizard SHALL advance to verification — with no token step for the owner

#### Scenario: Re-running does not duplicate records

- **WHEN** the flow runs again for a domain whose records already exist
- **THEN** the existing matching records SHALL be updated in place (never duplicated), and a CNAME that had been switched to proxied SHALL be corrected back to DNS only

### Requirement: The OAuth token is server-side, minimally retained, and never logged

The access token from the OAuth exchange is a sensitive credential. It SHALL be obtained and used SERVER-side (never exposed to the browser), used only to perform the record writes, and NOT retained beyond what the flow needs — it SHALL NOT be written to a log or surfaced in any error, and if ever stored it SHALL be encrypted at rest and revocable. The OAuth callback SHALL be protected against forgery (a verified `state`/PKCE), and the requested scope SHALL be the least needed (DNS edit + zone read — the `dns.write` and `zone.read` Cloudflare scopes).

#### Scenario: The token stays server-side and out of logs

- **WHEN** the OAuth flow completes (success or failure)
- **THEN** the access token SHALL never be sent to the browser, SHALL NOT appear in logs or error messages, and SHALL NOT be persisted unencrypted

#### Scenario: A forged callback is rejected

- **WHEN** the OAuth callback arrives with a missing or invalid `state`
- **THEN** it SHALL be rejected without exchanging the code or writing anything

### Requirement: Failures are explained and never block the manual path

The flow SHALL surface a clear, specific reason on failure — the owner declined the scope, the domain is not a zone on the chosen Cloudflare account, or the API rejected the write — and the manual DNS records SHALL remain visible throughout, so a failed or skipped Connect always leaves the owner able to add the records by hand. The write SHALL touch ONLY the two podway records (matched by exact name and type); it SHALL NOT modify or delete any of the owner's other DNS records.

#### Scenario: A domain that isn't on the chosen account falls back cleanly

- **WHEN** the owner authorizes but the domain's zone is not on the account they picked
- **THEN** the platform SHALL say so plainly and SHALL leave the manual records available, having changed nothing
