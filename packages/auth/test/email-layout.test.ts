import { describe, it, expect, vi } from "vitest";
import { renderEmail } from "../src/email-layout.js";
import { sendApprovalEmail, sendDunningEmail, sendNewRequestEmail } from "../src/notify.js";

const content = {
  name: "Dana",
  heading: "Reconnect Claude",
  paragraphs: ["Claude's login on <makore.app prod> expires in 3 days.", { label: "What is this?", url: "https://podway.io/docs/x" }],
  button: { label: "Reconnect Claude", url: "https://podway.io/dashboard/pods/a?tab=control&wiz=reconnect:claude-code" },
  footer: "You're getting this because you own this pod.",
};

describe("renderEmail — one content, two renderings", () => {
  it("greets by name, falls back to 'there'", () => {
    expect(renderEmail(content).text).toMatch(/^Hi Dana,/);
    expect(renderEmail(content).html).toContain("Hi Dana,");
    expect(renderEmail({ ...content, name: "  " }).text).toMatch(/^Hi there,/);
    expect(renderEmail({ ...content, name: null }).html).toContain("Hi there,");
  });

  it("escapes interpolated values in the HTML", () => {
    const { html } = renderEmail(content);
    expect(html).toContain("&lt;makore.app prod&gt;");
    expect(html).not.toContain("<makore.app prod>");
    expect(renderEmail({ ...content, name: "<script>x</script>" }).html).not.toContain("<script>x");
  });

  it("has at most ONE primary button, and every HTML link is also in the text", () => {
    const { html, text } = renderEmail(content);
    expect(html.match(/data-primary-button/g)?.length).toBe(1);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(text).toContain(h);
  });

  it("carries the footer in both parts", () => {
    const { html, text } = renderEmail(content);
    expect(text).toContain(content.footer);
    expect(html).toContain("You&#39;re getting this");
  });
});

const CFG = {
  saJson: JSON.stringify({ client_email: "sa@x.iam", private_key: "PEM" }),
  impersonate: "itzhak@podway.io",
  from: "Itzhak · Podway <hi@podway.io>",
};
const sent = async (fn: (f: never, tokenFn: never) => Promise<void>) => {
  const f = vi.fn(async () => new Response("{}", { status: 200 }));
  await fn(f as never, (async () => "t") as never);
  const raw = JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string).raw as string;
  return Buffer.from(raw, "base64url").toString("utf8");
};
const parts = (msg: string) =>
  [...msg.matchAll(/Content-Type: (text\/(?:plain|html))[^\n]*\r?\nContent-Transfer-Encoding: base64\r?\n\r?\n([A-Za-z0-9+/=\r\n]+)/g)].map(
    (m) => ({ type: m[1]!, body: Buffer.from(m[2]!.replace(/\s/g, ""), "base64").toString("utf8") }),
  );

describe("every email is multipart/alternative on the shared layout", () => {
  it("approval, access-request and dunning all send text + html", async () => {
    const msgs = [
      await sent((f, t) => sendApprovalEmail({ name: "Ada", email: "a@x.com" }, { ...CFG, fetchImpl: f, tokenFn: t })),
      await sent((f, t) => sendNewRequestEmail("op@x.com", { name: "Bo", email: "b@x.com" }, { approveUrl: "https://p/a", laterUrl: "https://p/l" }, { ...CFG, fetchImpl: f, tokenFn: t })),
      await sent((f, t) => sendDunningEmail({ name: "Cy", email: "c@x.com" }, { daysLeft: 3, amountDueCents: 1200, suspended: false }, { billingUrl: "https://p/b" }, { ...CFG, fetchImpl: f, tokenFn: t })),
    ];
    for (const m of msgs) {
      expect(m).toMatch(/Content-Type: multipart\/alternative; boundary=/);
      const p = parts(m);
      expect(p.map((x) => x.type)).toEqual(["text/plain", "text/html"]);
      expect(p[1]!.body).toContain("data-primary-button");
    }
    expect(parts(msgs[0]!)[0]!.body).toMatch(/^Hi Ada,/);
    expect(parts(msgs[1]!)[0]!.body).toContain("https://p/l"); // the secondary "later" link survives
    expect(parts(msgs[2]!)[1]!.body).toContain("$12.00");
  });
});
