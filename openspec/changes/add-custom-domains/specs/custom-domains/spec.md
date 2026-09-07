# custom-domains

## ADDED Requirements

### Requirement: An owner can map a custom hostname to one of their pods
An owner MAY add a fully-qualified hostname to a running pod they own. The system SHALL create the
mapping in `pending` state and present the exact DNS records the owner must add, without requiring any
access to the owner's DNS provider. A hostname SHALL map to at most one pod, and be unique across the
platform. The feature is cloud-only and SHALL be unavailable when `editionOss()`.

#### Scenario: Adding a subdomain
- **WHEN** the owner adds `app.customer.com` to their pod
- **THEN** a `custom_domains` row is created in `pending` state
- **AND** the UI shows `CNAME app.customer.com → cname.podway.cloud` plus a `TXT
  _podway-challenge.app.customer.com → <token>` to add

#### Scenario: Hostname already claimed
- **WHEN** the owner adds a hostname already mapped to another pod
- **THEN** the add is rejected with a clear "already in use" message and no row is created

#### Scenario: Self-host edition
- **WHEN** the instance is running `editionOss()`
- **THEN** the custom-domains UI and endpoints are absent (or return not-found)

### Requirement: Ownership and DNS are verified before a domain serves traffic
The system SHALL confirm the owner's DNS points at us AND that they control the domain (the TXT
challenge) before marking a domain `active` and before requesting any certificate. Verification runs
as a poller with backoff; the owner sees the current state and a plain reason for any failure.

#### Scenario: Records resolve
- **WHEN** the poller resolves the CNAME to `cname.podway.cloud` and the TXT to the issued token
- **THEN** the domain moves `pending → verifying`, a certificate is requested, and on issue it becomes
  `active`

#### Scenario: Records missing
- **WHEN** the CNAME or TXT does not resolve after the owner clicks "verify"
- **THEN** the domain stays `pending` with a "waiting for your DNS — records not found yet" message,
  and the poller retries with backoff

### Requirement: HTTPS certificates are issued and renewed automatically, on demand
The gateway edge SHALL obtain a Let's Encrypt certificate for an `active` (or `verifying`) hostname on
first TLS use, gated by an "ask" check that the hostname is a registered domain, and SHALL renew it
before expiry. Unregistered hostnames SHALL NOT trigger issuance. Certificates SHALL persist across
gateway redeploys.

#### Scenario: On-demand issuance for a registered domain
- **WHEN** a TLS ClientHello arrives with SNI for an `active` custom domain and no cached cert exists
- **THEN** the ask-check passes, a certificate is issued and cached, and the handshake completes

#### Scenario: Issuance refused for an unknown host
- **WHEN** a TLS ClientHello arrives with SNI for a hostname not in `custom_domains`
- **THEN** the ask-check fails and no certificate is requested (protecting the rate limit)

#### Scenario: Automatic renewal
- **WHEN** an issued certificate is within its renewal window
- **THEN** the edge renews it without owner action and updates `cert_not_after`

### Requirement: A custom domain routes to its pod and is public
For an `active` domain, the gateway SHALL route the terminated request by `Host` to the mapped pod's
port 3000, over the existing pod network path. A custom domain SHALL be publicly reachable regardless
of the pod's owner-only preview setting.

#### Scenario: Routing a live pod
- **WHEN** a request for `app.customer.com` reaches the gateway and the mapped pod is running with an
  app on `:3000`
- **THEN** the gateway proxies the request to that pod and returns its response over HTTPS

#### Scenario: Public access
- **WHEN** an unauthenticated visitor loads `app.customer.com`
- **THEN** the app is served (the owner-only preview gate does NOT apply to the custom domain)

### Requirement: Domain behaviour is defined when the pod is not serving
When the mapped pod is suspended, unhealthy, or destroyed, the custom domain SHALL serve a clean
"paused/unavailable" page rather than a dead connection or a certificate error. Removing a domain SHALL
stop routing it, and destroying a pod SHALL disable its domains.

#### Scenario: Suspended pod
- **WHEN** a request arrives for a custom domain whose pod is suspended
- **THEN** the gateway serves a parked page over valid HTTPS (not a connection reset or cert error)

#### Scenario: Owner removes a domain
- **WHEN** the owner removes a custom domain
- **THEN** routing for that hostname stops and the row is disabled

#### Scenario: Pod destroyed
- **WHEN** the owner destroys a pod that has custom domains
- **THEN** those domains are disabled and no longer route

### Requirement: The feature is invisible until its TLS edge is provisioned

Custom domains MUST NOT appear in the cockpit, and every custom-domain action MUST refuse, unless
BOTH the CNAME target and the dedicated anycast IPv4 are configured. Neither value may have a
default: a default makes an unprovisioned placeholder look like a working target, which is how an
owner ends up publishing DNS records that can never verify and waiting on a certificate that nobody
can issue. Hiding the row is presentation; the server action and the wizard page MUST each enforce
it independently, so a bookmarked URL or a hand-made request cannot create an unserveable domain.

#### Scenario: The edge has not been provisioned

- **WHEN** either the CNAME target or the anycast IP is unset or empty
- **THEN** the Settings row SHALL NOT render, the wizard page SHALL 404, and every domain action
  SHALL refuse

#### Scenario: The edge is provisioned

- **WHEN** both values are set
- **THEN** the row, the wizard, and the actions SHALL all become available

### Requirement: Only a live domain routes, and it never shows a Podway sign-in page

The gateway MUST resolve an inbound `Host` to a pod ONLY for a domain in the `active` state. A
domain that has verified DNS but has no certificate yet MUST NOT serve — a visitor would get a TLS
error rather than a page, which is worse than the address simply not resolving.

The gateway's OWN hosts (its hostname and the preview root) MUST never be resolved as customer
domains, so health and admin endpoints keep working and cost no lookup. Lookups MUST be cached
including NEGATIVE results, so a stranger pointing DNS at us cannot turn every request into a
database read.

When the pod's preview is owner-only, a custom domain MUST return a plain not-found and MUST NOT
redirect to a Podway sign-in page: a visitor typing the owner's domain has no relationship with
Podway, and redirecting would disclose where the site is hosted. Attaching a domain MUST NOT change
the pod's privacy setting — the owner makes that choice explicitly.

#### Scenario: A domain whose certificate has not been issued

- **WHEN** a request arrives for a hostname whose domain is `pending` or `verifying`
- **THEN** the gateway SHALL NOT route it to a pod

#### Scenario: A live domain on an owner-only pod

- **WHEN** a visitor requests an `active` custom domain whose pod's preview is owner-only
- **THEN** the response SHALL be a plain not-found, NOT a sign-in redirect, and the pod's privacy
  setting SHALL be unchanged

#### Scenario: The gateway's own hostname

- **WHEN** a request arrives on the gateway's own host or the preview root
- **THEN** it SHALL be handled as before, with no custom-domain lookup

