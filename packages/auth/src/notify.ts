import { renderEmail, type EmailContent } from "./email-layout.js";

/**
 * Best-effort Telegram alerts. No-ops when unconfigured, and never throw — a signup or
 * a pod incident must not fail because a notification did.
 */
export interface NotifyDeps {
  token?: string;
  chatId?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Report a notification that did not go out.
 *
 * These paths are deliberately best-effort — a failed notification must never break a signup or an
 * approval — but "best-effort" was implemented as TOTAL SILENCE, and that is how the approval and
 * invite mail stayed broken for weeks: `PODWAY_GMAIL_IMPERSONATE` pointed at an address with no
 * domain-wide delegation, every send got a 401, and nothing anywhere said so. A user signed up, saw
 * success, and received nothing (found 2026-09-07).
 *
 * Worse than the silence: the sends never checked `res.ok` at all. A 401 does not throw — fetch
 * resolves — so the code did not merely swallow an error, it never saw one.
 */
function reportSendFailure(what: string, detail: Record<string, unknown>): void {
  // console, not a logger dependency: this package is imported by the web app and the gateway, and
  // both ship their logs to the same place. The point is that the line EXISTS.
  console.error(JSON.stringify({ level: "error", svc: "notify", event: "notification_send_failed", what, ...detail }));
}

/** Did the API accept it? A non-2xx here is the failure that used to pass as success. */
async function assertAccepted(what: string, res: Response, extra: Record<string, unknown> = {}): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  reportSendFailure(what, { status: res.status, body: body.slice(0, 300), ...extra });
}

async function sendTelegram(token: string, chatId: string, text: string, f: typeof fetch): Promise<void> {
  try {
    const res = await f(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    await assertAccepted("telegram", res, { chatId });
  } catch (e) {
    // Still swallowed — a failed alert must not break the thing that raised it — but never silent.
    reportSendFailure("telegram", { error: (e as Error)?.message ?? String(e) });
  }
}

/**
 * Ops alert to a DEDICATED ops bot/channel — separate from growth/signup, so an OOM at
 * 3am does not land in the same feed as a new signup. Env: TELEGRAM_OPS_BOT_TOKEN /
 * TELEGRAM_OPS_CHAT_ID. No-op when unconfigured.
 */
export async function notifyOps(text: string, deps: NotifyDeps = {}): Promise<void> {
  const token = deps.token ?? process.env.TELEGRAM_OPS_BOT_TOKEN;
  const chatId = deps.chatId ?? process.env.TELEGRAM_OPS_CHAT_ID;
  if (!token || !chatId) return;
  await sendTelegram(token, chatId, text, deps.fetchImpl ?? fetch);
}

export async function notifySignup(
  u: { name?: string | null; email: string },
  deps: NotifyDeps = {},
): Promise<void> {
  const token = deps.token ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = deps.chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  await sendTelegram(token, chatId, `🔔 New podway signup: ${u.name || "(no name)"} — ${u.email}`, deps.fetchImpl ?? fetch);
}

export interface EmailDeps {
  saJson?: string;
  impersonate?: string;
  from?: string;
  fetchImpl?: typeof fetch;
  /** Injectable so the unit test doesn't need real Google creds or a network. */
  tokenFn?: (saJson: string, impersonate: string, f: typeof fetch) => Promise<string>;
}

const b64url = (x: Buffer | string): string => Buffer.from(x).toString("base64url");

/** MIME encoded-word for a header value with non-ASCII (the `·`/`—` in our From + subject). */
function encodeHeaderWord(s: string): string {
  return /^[\x00-\x7F]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

/** `Name <addr>` → encode the display name, keep the address raw. */
function encodeFrom(from: string): string {
  const m = from.match(/^(.*)<([^>]+)>\s*$/);
  if (!m) return from;
  return `${encodeHeaderWord(m[1]!.trim())} <${m[2]!.trim()}>`;
}

/**
 * A Google service-account access token via DOMAIN-WIDE DELEGATION (impersonating a real
 * Workspace mailbox). Hand-rolled JWT (RS256) → token exchange, so there's no google-auth SDK
 * in the web bundle. `sub` is the impersonated user; scope is gmail.send.
 */
async function gmailToken(saJson: string, impersonate: string, f: typeof fetch): Promise<string> {
  const { client_email, private_key } = JSON.parse(saJson) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: client_email,
      scope: "https://www.googleapis.com/auth/gmail.send",
      aud: "https://oauth2.googleapis.com/token",
      sub: impersonate,
      iat: now,
      exp: now + 3600,
    }),
  );
  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const assertion = `${header}.${claim}.${b64url(signer.sign(private_key))}`;
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string };
  if (!json.access_token) throw new Error(`gmail token exchange failed: ${json.error_description ?? "no token"}`);
  return json.access_token;
}

/**
 * Send one email on the shared layout (openspec: email-templates): multipart/alternative, a plain-text
 * part and an HTML part rendered from the SAME content. Gmail API via a Workspace service account with
 * domain-wide delegation. Best-effort by contract: missing config is a silent no-op and a failed send is
 * RECORDED and swallowed — it must never break the signup, approval, billing or reminder that sent it.
 */
export async function sendEmail(to: string, subject: string, content: EmailContent, deps: EmailDeps = {}): Promise<void> {
  const saJson = deps.saJson ?? process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const impersonate = deps.impersonate ?? process.env.PODWAY_GMAIL_IMPERSONATE;
  const from = deps.from ?? process.env.PODWAY_FROM_EMAIL;
  if (!saJson || !impersonate || !from || !to) return; // not configured yet → no-op, never throw
  const f = deps.fetchImpl ?? fetch;
  try {
    const token = await (deps.tokenFn ?? gmailToken)(saJson, impersonate, f);
    const { text, html } = renderEmail(content);
    const boundary = `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const part = (type: string, body: string) =>
      `--${boundary}\r\nContent-Type: ${type}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n` +
      `${Buffer.from(body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n")}\r\n`;
    const message =
      `From: ${encodeFrom(from)}\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${encodeHeaderWord(subject)}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n` +
      part("text/plain", text) +
      part("text/html", html) +
      `--${boundary}--\r\n`;
    const res = await f("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64url(message) }),
    });
    await assertAccepted("gmail", res, { to });
  } catch (e) {
    reportSendFailure("gmail", { error: (e as Error)?.message ?? String(e) });
  }
}

/**
 * Notify the OPERATOR that a new access request arrived, with ONE-CLICK Approve (the button) and
 * Later links carrying an AES-encrypted, unforgeable action token (see admin/quick); this function just
 * mails the URLs the caller minted.
 */
export async function sendNewRequestEmail(
  to: string,
  requester: { name?: string | null; email: string },
  links: { approveUrl: string; laterUrl: string },
  deps: EmailDeps = {},
): Promise<void> {
  const who = (requester.name ?? "").trim() || requester.email;
  await sendEmail(
    to,
    `New Podway access request: ${who}`,
    {
      name: null,
      heading: "New access request",
      paragraphs: [
        `${who} asked for access to Podway.`,
        `Name: ${requester.name || "(none)"} · Email: ${requester.email}`,
        { label: "Set aside for later", url: links.laterUrl },
        { label: "Review everyone", url: "https://podway.io/admin" },
      ],
      button: { label: "Approve", url: links.approveUrl },
      footer: "You're getting this because you approve Podway access requests.",
    },
    deps,
  );
}

/**
 * Tell an APPROVED user they're in — the email the /pending page promises. Copy of record:
 * docs/strategy/alpha-invite-copy.md §1 (keep in sync).
 */
export async function sendApprovalEmail(u: { name?: string | null; email: string }, deps: EmailDeps = {}): Promise<void> {
  await sendEmail(
    u.email,
    "You're in — your Podway spot is live",
    {
      name: u.name,
      heading: "You're in",
      paragraphs: [
        "Podway gives your coding agent a real computer in the cloud — isolated, yours, and still working after you close the laptop.",
        "Launch your first environment. It takes about a minute to reach a working project.",
        "You're one of a small first group, so I'll actually read what you send back. Reply to this email with anything — a bug, a rough edge, an idea, or just what you built.",
      ],
      button: { label: "Launch your first pod", url: "https://podway.io/signin" },
      footer: "You're getting this because you asked for access to Podway.",
    },
    deps,
  );
}

/**
 * The non-payment safety net's daily reminder: during the grace period, add a card or credit before the
 * pods are suspended; on `suspended`, how to bring them back.
 */
export async function sendDunningEmail(
  u: { name?: string | null; email: string },
  info: { daysLeft: number; amountDueCents: number; suspended: boolean },
  links: { billingUrl: string },
  deps: EmailDeps = {},
): Promise<void> {
  const amount = `$${(info.amountDueCents / 100).toFixed(2)}`;
  const days = `${info.daysLeft} day${info.daysLeft === 1 ? "" : "s"}`;
  await sendEmail(
    u.email,
    info.suspended ? "Your Podway pods are suspended" : `Action needed: your Podway pods will be suspended in ${days}`,
    info.suspended
      ? {
          name: u.name,
          heading: "Your pods are suspended",
          paragraphs: [
            `We could not collect payment for your pods (${amount}/month), and your credit did not cover it, so your pods are suspended.`,
            "Your data is safe. Add a card or credit and your pods come right back.",
          ],
          button: { label: "Fix billing and resume", url: links.billingUrl },
          footer: "You're getting this because you own pods on Podway.",
        }
      : {
          name: u.name,
          heading: `Your pods will be suspended in ${days}`,
          paragraphs: [
            `We could not charge for your pods (${amount}/month), and your credit does not cover it.`,
            `Add a card or credit within ${days} to keep them running. Your data stays safe either way.`,
          ],
          button: { label: "Update billing", url: links.billingUrl },
          footer: "You're getting this because you own pods on Podway.",
        },
    deps,
  );
}
