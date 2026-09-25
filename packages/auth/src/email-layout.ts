/**
 * The ONE email layout (openspec: email-templates). One content description renders to a plain-text
 * part and an HTML part, so the two can never say different things. The HTML is deliberately
 * old-fashioned — single 600px column, tables, inline styles, a table "bulletproof" button — because
 * that is what renders the same in Gmail, Outlook and Apple Mail. No dependency: four emails do not
 * justify React Email in the gateway bundle.
 */

export interface EmailLink {
  label: string;
  url: string;
}

export interface EmailContent {
  /** Recipient's name; empty/missing → "there". */
  name?: string | null;
  heading: string;
  /** Body, top to bottom. A string is a paragraph; a link is a secondary (non-button) link line. */
  paragraphs: (string | EmailLink)[];
  /** At most ONE primary action. */
  button?: EmailLink;
  /** Why the recipient got this email. */
  footer: string;
  signoff?: string;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const BLUE = "#2F6BFF";

export function renderEmail(c: EmailContent): { text: string; html: string } {
  const name = (c.name ?? "").trim() || "there";
  const signoff = c.signoff ?? "— The Podway team";

  const textBody = c.paragraphs.map((p) => (typeof p === "string" ? p : `${p.label}:\n${p.url}`));
  const text = [
    `Hi ${name},`,
    ...textBody,
    ...(c.button ? [`${c.button.label}:\n${c.button.url}`] : []),
    signoff,
    `--\n${c.footer}`,
  ].join("\n\n");

  const para = (inner: string) =>
    `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#1f2937" class="t">${inner}</p>`;
  const htmlBody = c.paragraphs
    .map((p) =>
      typeof p === "string"
        ? para(esc(p))
        : para(`<a href="${esc(p.url)}" style="color:${BLUE};text-decoration:underline">${esc(p.label)}</a>`),
    )
    .join("");
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td data-primary-button style="border-radius:8px;background:${BLUE}">` +
      `<a href="${esc(c.button.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${esc(c.button.label)}</a>` +
      `</td></tr></table>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(c.heading)}</title>
<style>@media (prefers-color-scheme: dark){.bg{background:#0f1420!important}.card{background:#171d2b!important}.t{color:#e5e7eb!important}.m{color:#9ca3af!important}}</style>
</head><body style="margin:0;padding:0;background:#f4f6fb" class="bg">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb" class="bg"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="padding:0 4px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:${BLUE}">podway</td></tr>
<tr><td class="card" style="background:#ffffff;border-radius:12px;padding:32px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;color:#111827" class="t">${esc(c.heading)}</h1>
${para(`Hi ${esc(name)},`)}${htmlBody}${button}${para(esc(signoff))}
</td></tr>
<tr><td class="m" style="padding:16px 4px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6b7280">${esc(c.footer)}</td></tr>
</table></td></tr></table></body></html>`;

  return { text, html };
}
