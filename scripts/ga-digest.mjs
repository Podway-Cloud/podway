#!/usr/bin/env node
// podway GA4 digest — week-over-week for podway.io. No secrets are stored in this file.
// Run: source <(podway secrets env) && node ~/ga-digest.mjs
//
// Auth: prefers GOOGLE_SERVICE_ACCOUNT_JSON (a service account has no refresh token to expire —
// the OAuth token silently kept working against the DEAD podbay.cloud property for weeks while the
// live site went unmeasured). Falls back to the GA_OAUTH_* trio so nothing breaks mid-migration;
// once the service account is granted Viewer in GA, those three can be deleted.
//
// PROPERTY: there is deliberately NO default. A wrong-but-plausible id is how this reported
// confident zeros about a site nobody visits (2026-09-07). Unset should fail loudly, not guess.
import { createSign } from "node:crypto";

const SA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const CID = process.env.GA_OAUTH_CLIENT_ID, CS = process.env.GA_OAUTH_CLIENT_SECRET, RT = process.env.GA_OAUTH_REFRESH_TOKEN;
const PID = process.env.GA_PROPERTY_ID;
if (!PID) {
  console.error("GA_PROPERTY_ID is not set. Find it in GA → Admin → Property Settings → Property ID.");
  console.error("Refusing to guess: a wrong property reports zeros that read like 'no traffic'.");
  process.exit(2);
}
const PROP = `properties/${PID}`;
if (!SA && !(CID && CS && RT)) {
  console.error("no Google credential: set GOOGLE_SERVICE_ACCOUNT_JSON (preferred) or the GA_OAUTH_* trio.");
  process.exit(2);
}

/** Service-account access token via the JWT-bearer grant. */
async function saToken() {
  const sa = JSON.parse(SA);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  });
  const sig = createSign("RSA-SHA256"); sig.update(unsigned); sig.end();
  const jwt = unsigned + "." + sig.sign(sa.private_key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("service-account token: " + JSON.stringify(j));
  return { tok: j.access_token, who: sa.client_email };
}

async function token() {
  if (SA) {
    const { tok, who } = await saToken();
    console.error(`(auth: service account ${who})`);
    return tok;
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CID, client_secret: CS, refresh_token: RT, grant_type: "refresh_token" }),
  });
  const j = await r.json(); if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  console.error("(auth: OAuth refresh token — migrate to a service account, it cannot expire)");
  return j.access_token;
}
let TOK;
async function report(body) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/${PROP}:runReport`,
    { method: "POST", headers: { authorization: `Bearer ${TOK}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(`${r.status}: ${j.error?.message || JSON.stringify(j)}`); return j;
}
const THIS = { startDate: "7daysAgo", endDate: "today" };
const PREV = { startDate: "14daysAgo", endDate: "8daysAgo" };
const delta = (a, b) => { a = +a || 0; b = +b || 0; if (!b) return a ? "▲ new" : "—"; const p = Math.round(((a - b) / b) * 100); return `${p >= 0 ? "▲" : "▼"}${Math.abs(p)}% (was ${b})`; };
const rows = (j) => (j.rows || []).map(r => ({ d: r.dimensionValues.map(v => v.value), m: r.metricValues.map(v => +v.value) }));

TOK = await token();

// 1) Headline totals, this week vs previous (two dateRanges → dimension 'dateRange')
const tot = await report({ dateRanges: [THIS, PREV], metrics: [
  { name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" }, { name: "screenPageViews" },
  { name: "engagementRate" }, { name: "conversions" },
] });
const byRange = {}; for (const r of rows(tot)) byRange[r.d[0]] = r.m; // dateRange dimension appended
const cur = byRange["date_range_0"] || [0,0,0,0,0,0], prv = byRange["date_range_1"] || [0,0,0,0,0,0];
console.log("═══ podway.io — GA4 weekly digest (last 7 days vs prior 7) ═══\n");
console.log("HEADLINE");
console.log(`  sessions       ${cur[0]}   ${delta(cur[0], prv[0])}`);
console.log(`  users          ${cur[1]}   ${delta(cur[1], prv[1])}   (new: ${cur[2]})`);
console.log(`  pageviews      ${cur[3]}   ${delta(cur[3], prv[3])}`);
console.log(`  engagement     ${(cur[4]*100).toFixed(0)}%   (prior ${(prv[4]*100).toFixed(0)}%)`);
console.log(`  conversions    ${cur[5]}   ${delta(cur[5], prv[5])}   ${cur[5]===0&&cur[0]>0?"⚠ no GA conversion event configured yet":""}`);

async function top(dim, metric, label, limit = 6) {
  const j = await report({ dateRanges: [THIS], dimensions: [{ name: dim }], metrics: [{ name: metric }],
    orderBys: [{ metric: { metricName: metric }, desc: true }], limit });
  console.log(`\n${label}`);
  const rr = rows(j);
  if (!rr.length) { console.log("  (no data yet)"); return; }
  for (const r of rr) console.log(`  ${String(r.m[0]).padStart(5)}  ${r.d[0] || "(not set)"}`);
}
await top("sessionDefaultChannelGroup", "sessions", "ACQUISITION — channels (sessions)");
await top("sessionSource", "sessions", "ACQUISITION — top sources (sessions)");
await top("landingPage", "sessions", "LANDING PAGES (sessions)");
await top("pagePath", "screenPageViews", "TOP PAGES (views)");
await top("country", "totalUsers", "GEOGRAPHY (users)", 5);
await top("deviceCategory", "totalUsers", "DEVICE (users)", 3);
console.log("\n(Consented visits only — GA Consent Mode. Aggregate tables lag a few hours.)");
