# Auth setup (GitHub OAuth + Neon)

Podway accounts use **better-auth** with **GitHub OAuth**, backed by **Neon Postgres**. The app
runs without these configured (auth stays disabled, landing page unaffected); set them to enable
sign-in.

## 1. Neon database

Create a Neon project and copy its connection string → `DATABASE_URL`.

Apply the schema:

```bash
DATABASE_URL=postgres://... pnpm -F @podway/db exec drizzle-kit migrate
```

## 2. GitHub OAuth app

Create a GitHub OAuth app (Settings → Developer settings → OAuth Apps):

- Homepage URL: `https://podway.cloud`
- Authorization callback URL: `https://podway.cloud/api/auth/callback/github`

Copy the Client ID and generate a Client Secret.

## 3. Secrets (Fly)

Set as **Fly secrets** — never commit them:

```bash
fly secrets set -a podway-web \
  DATABASE_URL="postgres://..." \
  BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  BETTER_AUTH_URL="https://podway.cloud" \
  GITHUB_CLIENT_ID="..." \
  GITHUB_CLIENT_SECRET="..."
```

## 4. Deploy

apps/web now depends on the workspace package `@podway/db`, so deploy with the **repo root** as
build context:

```bash
fly deploy --config apps/web/fly.toml --dockerfile apps/web/Dockerfile .
```

## Verify

Visit `/signin` → Continue with GitHub → you should land on `/dashboard` signed in. The identity
(`user.id`) is the `ownerId` used by `@podway/control-plane`.

## Pod provisioning (dashboard `/new`)

- `/dashboard` (pod list) and `/new` (environment catalog) work with just the DB above.
- **Launching a pod** additionally requires the Fly provider: set `FLY_API_TOKEN` (+ `PODWAY_PODS_APP`)
  as Fly secrets. Until then `/new` shows a "provisioning not enabled" banner and Launch is disabled.
- The image sets `PODWAY_ENVIRONMENTS_ROOT=/app/environments` (the catalog is read from disk); the
  Dockerfile copies `environments/` into the runner.
- Shareable launch link: `podway.cloud/new?env=<name>` preselects an environment and survives the
  sign-in round-trip — the basis for future "Launch on Podway" README badges.

## Access control (invite-only)

Sign-in is open, but the product is gated by approval. A user is allowed if their `approved` flag
is set, OR their email is in `ADMIN_EMAILS`, OR in `PREAPPROVE_EMAILS`.

- `ADMIN_EMAILS` (comma-separated) — always allowed + can reach `/admin` to approve/revoke others.
  **Set this to your own email before deploy** so you're not locked out.
- `PREAPPROVE_EMAILS` (optional) — auto-allow known testers without clicking Approve.
- Unapproved signed-in users see `/pending`. Approve them at `/admin` (one click).

## Signup alerts (Telegram)

Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to get a "🔔 new signup" ping. To find the chat id:
message your bot, then `GET https://api.telegram.org/bot<TOKEN>/getUpdates`. Unset = no alerts
(sign-up still works).
