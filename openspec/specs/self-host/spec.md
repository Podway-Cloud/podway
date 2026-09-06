# self-host Specification

## Purpose

The self-host (OSS) edition runs the whole of podway single-tenant on the owner's own machine or
VM — no cloud account, no multi-tenancy, no hosted gateway. It reuses the same control plane,
gateway, dashboard, and pod image as the cloud, swapping the provider for local Docker and gating
the cloud-only surfaces (accounts, billing, analytics, fleet ops) off behind an edition flag. The
owner brings their own Claude subscription; the agent signs in per pod. It is packaged as a
one-command `docker compose` install that pulls prebuilt, multi-architecture images.
## Requirements
### Requirement: Single-tenant OSS edition

When `PODWAY_EDITION=oss`, the app SHALL run single-tenant with one pre-approved local owner and no
sign-in flow, and SHALL NOT present cloud account surfaces (marketing landing, waitlist/approval,
billing). All ownership-scoped operations use the fixed local owner id.

#### Scenario: The root is the app, not a marketing page

- **WHEN** an unauthenticated request hits `/` in the OSS edition
- **THEN** it SHALL redirect to the dashboard (the self-host install has no marketing funnel), and
  the dashboard SHALL render for the local owner with no sign-in step

#### Scenario: Cloud-only surfaces are gated off

- **WHEN** the OSS edition renders the dashboard or handles a launch
- **THEN** it SHALL NOT run cloud analytics/experiment tracking, SHALL NOT show a cookie-consent
  banner, and SHALL NOT show or enforce an account slot budget (the only limit is the host's
  hardware); admin backoffice routes remain inaccessible to the non-admin local owner

### Requirement: Pods run as local Docker containers

The OSS edition SHALL launch pods as containers on a Docker host via a `SandboxProvider`
implementation (`local`), driving the same pod image the cloud uses. Cloud-only provider features
(managed image pipeline, GitHub OAuth app, Codex pairing, resize, snapshot) SHALL report
`unsupported` rather than pretending to work. The Docker host MAY be local or a remote daemon
addressed as `ssh://user@host`.

#### Scenario: Launch creates a container and injects the pod spec

- **WHEN** the owner creates a pod
- **THEN** the provider SHALL `docker run` the pod image and inject the environment's full pod-spec
  (kickoff, permissions, and the `.claude` layer) exactly as the managed providers do, so the pod's
  onboarding and remote-control behave identically to a cloud pod

#### Scenario: A local pod is never auto-suspended

- **WHEN** a `local`-provider pod sits idle
- **THEN** the control plane SHALL NOT automatically suspend it — an unattended `docker stop` on the
  owner's own machine would surprise them and kill their agent (suspend/resume stay explicit verbs)

### Requirement: Docker-in-image app-pods are Incus/cloud only; self-host app-pods are deferred

An app-pod (`kind: app`, e.g. the n8n environment) deploys its stack with `docker compose` from a
Docker engine baked into the pod-BASE image. That capability SHALL be built into the Incus/cloud
pod-base image ONLY. The OSS/self-host pod-base image (the OCI Dockerfile) SHALL intentionally OMIT
Docker: a self-host pod already IS a Docker container (the `local` provider's `docker run`), and
running Docker inside it is docker-in-docker under an unprivileged nesting model, which fails. This is
a deliberate edition divergence (edition-parity rule 5), not a parity gap to close by adding Docker to
the self-host image. Until an alternative delivery mechanism exists for self-host, `kind: app`
environments (n8n and any that follow) are DEFERRED there: the environment's `setup` step depends on a
`docker` binary the self-host pod does not have, so it cannot complete.

#### Scenario: Self-host omits Docker from its pod image by design

- **WHEN** the self-host (OCI) pod-base image is built
- **THEN** it SHALL NOT install a Docker engine, and this SHALL NOT be treated as a parity gap to fix
  — it is a deliberate edition divergence, because self-host pods cannot nest Docker

#### Scenario: An app-pod's setup cannot complete on self-host

- **WHEN** a `kind: app` environment (e.g. n8n) is launched on the self-host edition
- **THEN** its `docker compose`-dependent setup SHALL fail for lack of a Docker engine in the pod,
  reflecting that app-pods are not yet a supported self-host capability

### Requirement: Containerized control plane reaches its pods and the browser reaches previews

When the control plane itself runs in a container (the compose install), it SHALL reach a pod's
in-pod services (terminal gateway, health, metrics) by a route that works container-to-container,
and SHALL surface a preview address that the owner's BROWSER can reach.

#### Scenario: Internal dialing uses the shared network, previews use the host mapping

- **GIVEN** pods join a shared Docker network (`PODWAY_LOCAL_NETWORK`)
- **WHEN** the gateway resolves a pod's agent endpoint, versus when the dashboard builds a preview link
- **THEN** internal resolution SHALL use the pod's container-DNS name (loopback would be the control
  plane's own container), while the preview link SHALL use the pod's published host-port mapping so a
  browser can open it

### Requirement: The self-host daemon serves the terminal and provisions pods

The OSS edition SHALL provide a daemon that runs the real terminal **gateway** (a transparent PTY
WebSocket proxy to the pod-agent) plus the **provisioner/reconcile** loop, in one process, on the
same database the dashboard uses. The daemon SHALL be single-tenant (every connection is the local
owner) and bound to loopback unless deliberately exposed.

#### Scenario: The cockpit terminal connects with no gateway URL to configure

- **GIVEN** a reverse proxy routes `/pods/*` to the daemon on the same origin as the dashboard
- **WHEN** the owner opens a running pod's terminal
- **THEN** the browser SHALL derive the WebSocket origin from the page location (no build-time
  gateway URL required), and the terminal SHALL be interactive; with no daemon reachable, the cockpit
  SHALL show a graceful fallback (attach via `docker exec … tmux attach`, or open in the Claude app)
  rather than spin on "Reconnecting…"

### Requirement: One-command compose install from prebuilt images

The OSS edition SHALL be installable with a single command that pulls prebuilt multi-architecture
images (no local build) and starts Postgres, the dashboard, the daemon, and a single-origin reverse
proxy, applying database migrations on startup and generating a per-install secret-vault key on
first run.

#### Scenario: `docker compose up` brings up a working dashboard

- **WHEN** the owner runs the install on a Docker host
- **THEN** the stack SHALL come up without any source checkout or image build, the migrations SHALL
  apply automatically, and the owner SHALL reach the dashboard at the configured port and be able to
  create a pod, sign in with their Claude account, and use the terminal and preview

### Requirement: Image overrides survive the rename

The self-host compose SHALL resolve its app and pod images from `PODWAY_APP_IMAGE` /
`PODWAY_POD_IMAGE`, falling back to the pre-rename `PODBAY_APP_IMAGE` / `PODBAY_POD_IMAGE` before
falling back to the published default.

An install created before the rename may carry the old variable in its `.env`. Honouring only the new
name would not error — it would silently ignore the operator's pin and pull a different image than
they chose, which is the worst shape of failure: a wrong image with no signal. The fallback SHALL be
removed only when the transition window closes.

The published defaults SHALL name the same registry namespace the release pipeline publishes to. They
disagreed between the rename and 2026-09-05, and a fresh install failed at image pull because compose
pointed at a namespace that held no packages.

#### Scenario: An install pinned an image before the rename

- **WHEN** a self-host install has only `PODBAY_APP_IMAGE` or `PODBAY_POD_IMAGE` set
- **THEN** compose SHALL use that value rather than the published default

#### Scenario: Neither variable is set

- **WHEN** no image override is present
- **THEN** compose SHALL pull the published default from the namespace the release pipeline currently
  publishes to

### Requirement: Pods are sized against the real host, not cloud tiers

In the OSS edition, pod creation SHALL let the owner choose the pod's real CPU and memory instead of
cloud size tiers, defaulting to no explicit limit (the pod uses what it needs). The local provider
SHALL enforce a chosen limit via container resource controls (`--cpus`, `--memory`), and metrics for
a limited pod SHALL reflect the container's own usage rather than the whole host.

#### Scenario: Choosing CPU and memory bounds the pod

- **WHEN** the owner creates an OSS pod and sets a CPU and/or memory value
- **THEN** the provider SHALL run the container with the matching `--cpus`/`--memory` limits, and the
  pod's reported memory metric SHALL be its cgroup usage against that limit (not the host total)

#### Scenario: The default is unlimited and unchanged

- **WHEN** the owner creates an OSS pod without setting a limit
- **THEN** the pod SHALL run with no CPU/memory cap (identical to prior behavior), and its metrics MAY
  report host-relative values as before

### Requirement: The sizing UI reflects host capacity

The OSS pod-creation UI SHALL surface the Docker host's capacity: its total CPU and memory, the
amount already committed to running podway pods, and what remains. It SHALL warn when a chosen size
exceeds what's free but SHALL NOT hard-block the owner from deliberately overcommitting their own
machine.

#### Scenario: Free capacity is shown and over-allocation warns

- **WHEN** the owner opens the OSS sizing UI
- **THEN** it SHALL show total, committed-to-pods, and free CPU/memory from the host, and if the
  owner picks more than is free it SHALL warn while still permitting the launch

### Requirement: Self-host pods update by recreating on the newest pod-base, keeping their data

In the OSS edition, updating a pod SHALL pull the newest pod-base tag the host runs and recreate the
container on it, REUSING the pod's persistent `/home/dev` volume so its work, agent login, secrets,
and GitHub token survive. Because self-host has no cloud image manifest, the update SHALL be offered
whenever the pod's recorded image digest differs from the host's currently-pulled pod-base digest.
The UI SHALL describe what the update contains from a STATIC release manifest published to the public
install repo (release-versioning §4): when a published release names the target digest, it SHALL show
that release's version and summary; otherwise, or when the manifest cannot be fetched, it SHALL fall
back to the concrete from→to build digests. The manifest SHALL be fetched from the public artifact,
never from the Podway cloud service, and update availability SHALL NOT depend on reaching it. A pod
created BEFORE persistent volumes (no named home volume) has its work only in the container layer, so
the provider SHALL REFUSE to update it — a recreate would erase `~/work` — and direct the owner to
launch a fresh pod instead.

#### Scenario: A volume-backed pod updates without losing data

- **WHEN** the owner updates an OSS pod that has a persistent `/home/dev` volume
- **THEN** the provider SHALL pull the newest pod-base, recreate the container on it reusing that
  volume, and re-push the preserved pod-spec and secrets, so `~/work` and the agent's sign-in survive

#### Scenario: An update names its version when a release describes it, else shows digests

- **WHEN** an OSS pod is offered an update and the published release manifest names the target digest
- **THEN** the UI SHALL show that release's version and summary; and WHEN the manifest is unreachable
  or names no matching release, the UI SHALL show the from→to build digests instead, with the update
  still available

#### Scenario: A pre-volume pod refuses the update rather than wiping work

- **WHEN** the owner tries to update an OSS pod created before persistent volumes (no home volume)
- **THEN** the provider SHALL refuse with a clear message that updating would erase `~/work`, leaving
  the pod untouched, and the cockpit SHALL surface that message instead of silently reverting

### Requirement: Self-host is reachable from a remote browser via a deployment mode

The self-host edition SHALL support being reached from a browser on a DIFFERENT machine than the
Docker host, selected by a deployment mode recorded at install time. It SHALL support three modes:
`local` (bind `localhost:8080`, no TLS — private/dev use), `ip` (a public host with no domain), and
`domain` (the owner's own domain). The dashboard URL and every pod preview URL SHALL be derived from
the active mode, and the control plane SHALL surface those real URLs rather than the Docker host's
loopback.

#### Scenario: Local mode is unchanged

- **WHEN** the owner installs in `local` mode (or on a host with no public IP)
- **THEN** the dashboard SHALL be served at `http://localhost:8080` and pod previews SHALL use the
  host loopback, exactly as before — no TLS, no external DNS

#### Scenario: A public host with no domain still gets working, secure previews

- **WHEN** the owner installs on a public host without providing a domain (the `ip` default)
- **THEN** the dashboard and each pod preview SHALL be reachable at an HTTPS subdomain derived from
  the host's public IP via a magic-DNS service (`<pod>.<ip>.sslip.io`), with certificates obtained
  automatically — the owner SHALL NOT be required to own or configure a domain, and SHALL be offered
  a raw `http://<public-ip>:<port>` fallback as an explicit opt-out

#### Scenario: An owner-supplied domain gives clean per-pod subdomains

- **WHEN** the owner installs in `domain` mode with their domain
- **THEN** the dashboard SHALL be served on their chosen host and each pod preview at a per-pod
  subdomain under that domain (`<pod>.pods.<domain>`), and the install SHALL print the exact DNS
  records the owner must create

#### Scenario: A host that already uses 80/443 coexists instead of failing

- **WHEN** the owner installs on a public host where an existing reverse proxy already holds 80/443
- **THEN** the installer SHALL NOT fail or seize those ports; it SHALL keep podway on its own local
  port, render podway's routing there without TLS, and emit a snippet the owner adds to their front
  proxy to terminate TLS and forward the dashboard + preview hostnames to podway — so previews still
  work through the existing proxy (verified live in both this behind-proxy mode and the podway-owns-
  80/443 mode)

### Requirement: Pod previews route through the single front door, not per-pod host ports

In the public deployment modes (`ip`, `domain`), pod HTTP previews SHALL be served THROUGH the
existing reverse proxy — routed by the pod's preview hostname to the pod container's dev-server port
over the shared pod network — rather than by publishing a distinct host port per pod. The
`publishedAddress()` the control plane returns SHALL be the front-door preview URL for that mode.

#### Scenario: One open port pair serves every pod

- **WHEN** any number of pods are running in a public mode
- **THEN** all their previews SHALL be reachable through the single 80/443 front door (proxied to
  each `podway-<id>` dev-server port), with NO per-pod host port to publish or per-pod firewall rule
  to open

#### Scenario: The preview URL is the public URL, never the host loopback

- **WHEN** the dashboard shows a pod's preview link in a public mode
- **THEN** it SHALL be the pod's public HTTPS URL for that mode, never `127.0.0.1:<port>` or the
  Docker host's loopback

### Requirement: Automatic HTTPS in public modes, gated to valid hostnames

In the `ip` and `domain` modes the proxy SHALL obtain and serve TLS certificates automatically for
the dashboard and pod preview hostnames. Because certificate issuance is triggered by inbound
hostnames, the proxy SHALL consult an authorization check so that certificates are issued ONLY for
the dashboard host and hostnames that map to a real, current pod — an unknown hostname SHALL NOT
cause a certificate to be requested.

#### Scenario: A live pod's preview host gets a certificate; a bogus one does not

- **WHEN** a request arrives for `<pod>.<base>` where `<pod>` is a running pod
- **THEN** the proxy SHALL obtain a certificate and serve the preview; **AND WHEN** a request arrives
  for a hostname that maps to no current pod, the proxy SHALL refuse to request a certificate for it

### Requirement: Install detects the environment and reports reachability honestly

The installer SHALL detect the host's public IP (via cloud metadata or a sanctioned outbound fetch,
not merely `hostname -I`), select and confirm the deployment mode, write the proxy hostnames and
mode configuration, and offer to open the host OS firewall (detecting ufw/iptables/firewalld) for the
ports the chosen mode needs. It SHALL then verify what it can and **report honestly**: it SHALL NOT
claim a URL is "verified reachable" when it cannot prove external reachability, and SHALL explicitly
state that a cloud provider's security group is outside the host and may still block access, with the
exact ports to open. It SHALL finish by printing the real working URL(s) and any required DNS records.

#### Scenario: OS firewall is opened and the honest caveat is shown

- **WHEN** the installer runs in a public mode and detects an active OS firewall
- **THEN** it SHALL offer to open the required ports there, and regardless of that outcome SHALL tell
  the owner that a cloud security group (invisible from inside the host) may still need those ports
  opened — never presenting a bare "verified ✅" it cannot substantiate

#### Scenario: The owner is given a URL that reflects the real mode

- **WHEN** installation completes
- **THEN** the final output SHALL print the dashboard URL for the active mode (e.g. the sslip.io or
  domain URL in public modes, `localhost:8080` in local mode) rather than only a private
  `hostname -I` address

### Requirement: The T3 Code backend URL is edition-correct

The pairing token and backend URL that connect the T3 Code app to a pod SHALL be derived from the same
public address the pod's preview actually uses for the running edition — cloud's preview host for a
cloud pod, and the self-host published address (`LocalProvider.publishedAddress`) for an OSS/`local`
pod — never assuming the cloud `PODWAY_PREVIEW_BASE` on self-host. When the running edition cannot
expose a URL a remote device can reach (e.g. a plain loopback `local` pod with no public deployment
mode), the platform SHALL refuse to enable T3 Code with an honest message rather than mint a pairing
token against an unreachable URL.

#### Scenario: Self-host uses its published address

- **WHEN** an OSS/`local` pod in a public-reachable deployment mode enables T3 Code control
- **THEN** the backend URL and pairing token are built from the self-host published address, and the
  T3 app can reach the pod at that URL

#### Scenario: Honest refusal when no reachable URL exists

- **WHEN** a pod's edition/deployment cannot produce a URL reachable from a remote device
- **THEN** enabling T3 Code is refused with a clear explanation, and no pairing token is minted
  against an unreachable address

#### Scenario: Cloud is unaffected

- **WHEN** a cloud pod enables T3 Code control
- **THEN** the backend URL is built from the cloud preview host as before

### Requirement: Self-host presents build identity for updates

A self-host install SHALL tell the owner what an available update contains. When a published release
manifest is reachable, the UI SHALL present the release version and description for the build being
offered. When it is not reachable, the UI SHALL present the concrete from→to build digests, which
remains the honest fallback.

This replaces the previous behaviour of presenting digests as the ONLY update information. Digests are
unorderable by eye — an owner cannot tell from two hex strings which is newer, or whether the update
is a security fix or a rebuild — so digests alone are a floor, not the intended experience.

#### Scenario: An update is described by its release

- **WHEN** a self-host owner is offered an update and the release manifest is reachable
- **THEN** the version and description of the target build SHALL be shown

#### Scenario: The manifest is unreachable

- **WHEN** the release manifest cannot be fetched
- **THEN** the from→to build digests SHALL be shown instead and the update SHALL remain available —
  self-host SHALL NOT require any network service to update

#### Scenario: Self-host does not phone home to obtain release information

- **WHEN** a self-host install obtains release information
- **THEN** it SHALL do so from a published public artifact and SHALL NOT contact the Podway cloud
  service, so an install remains independent of the hosted product

