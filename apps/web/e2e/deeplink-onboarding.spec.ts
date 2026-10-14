import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";
import { USERS } from "./users";

async function dbClient() {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const { Client } = await import("pg");
  const state = JSON.parse(
    readFileSync(path.join(process.cwd(), ".e2e-state.json"), "utf8"),
  ) as { dbUrl?: string };
  if (!state.dbUrl) throw new Error("e2e state has no dbUrl — is global-setup current?");
  const client = new Client({ connectionString: state.dbUrl });
  await client.connect();
  return client;
}

async function accountRef(email: string): Promise<string | null> {
  const c = await dbClient();
  try {
    const r = await c.query<{ ref: string | null }>(`SELECT ref FROM "user" WHERE email = $1`, [email]);
    return r.rows[0]?.ref ?? null;
  } finally {
    await c.end();
  }
}

async function podRef(slug: string): Promise<string | null> {
  const c = await dbClient();
  try {
    const r = await c.query<{ ref: string | null }>(`SELECT ref FROM pods WHERE id = $1`, [slug]);
    return r.rows[0]?.ref ?? null;
  } finally {
    await c.end();
  }
}

async function clearAccountRef(email: string): Promise<void> {
  const c = await dbClient();
  try {
    await c.query(`UPDATE "user" SET ref = NULL WHERE email = $1`, [email]);
  } finally {
    await c.end();
  }
}

async function expectStep(page: Page, label: string, current: number, total: number): Promise<void> {
  const main = page.getByRole("main");
  await expect(main.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(main.getByText(`${current} / ${total}`, { exact: true })).toBeVisible();
}

test.describe("deep-link onboarding (/start)", () => {
  test.beforeEach(async () => {
    // First-touch ref is set-once — clear it before each test so this run's ref sticks
    // regardless of what earlier tests in the same suite wrote.
    await clearAccountRef(USERS.approved.email);
  });

  // landing-funnel-fixes: the one Show HN visitor who clicked an app left at the sign-in wall.
  test("an anonymous app link shows the wizard; Create asks for sign-in and the choices come back", async ({ page }) => {
    await page.goto("/start?app=uptime-kuma&ref=e2e-anon");
    await expect(page.getByRole("heading", { name: /new pod — uptime kuma/i })).toBeVisible();
    await expect(page).toHaveURL(/\/start\?/); // no redirect to sign-in yet
    await page.getByLabel("Name").fill("anon pick");
    const next = page.getByRole("button", { name: /^next$/i });
    while (await next.count()) await next.click();
    await expect(page.getByText("Next: sign in with GitHub or Google. Your choices are kept.")).toBeVisible();
    await page.getByRole("button", { name: /^create (my free )?pod$/i }).click();
    await page.waitForURL(/\/signin\?next=/);
    const carried = new URL(new URL(page.url()).searchParams.get("next")!, "http://localhost");
    expect(carried.pathname).toBe("/start");
    expect(carried.searchParams.get("app")).toBe("uptime-kuma");

    // Signed in (test login stands in for OAuth), the carried link lands on the real wizard with the draft.
    await login(page, "approved");
    await page.goto(`${carried.pathname}${carried.search}`);
    await page.waitForURL(/\/dashboard\/pods\/new\?/);
    await expect(page.getByText("anon pick").first()).toBeVisible();
    expect(await accountRef(USERS.approved.email)).toBe("e2e-anon");
  });

  test("unknown app falls back to the catalog — no error, no launch", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/start?app=does-not-exist&ref=e2e-unknown");
    await page.waitForURL(/\/dashboard\/create/);
    // First-touch ref still records even though the app fell back — attribution and the app
    // pick are independent (spec: "unknown app falls back safely").
    expect(await accountRef(USERS.approved.email)).toBe("e2e-unknown");
  });

  // landing-funnel-fixes: signed out, the landing's catalog link shows the catalog; a card opens the
  // signed-out wizard with the same ref. Signed in, it still goes to the dashboard catalog.
  test("a landing app-catalog link shows the catalog signed out; a card opens the wizard with the ref", async ({ page }) => {
    await page.goto("/start?tab=apps&ref=e2e-app-catalog");
    await expect(page).toHaveURL(/\/start\?/);
    await expect(page.getByRole("tab", { name: "Apps" })).toHaveAttribute("data-state", "active");
    await page.getByRole("link", { name: "Launch Uptime Kuma" }).click();
    await page.waitForURL(/\/start\?app=uptime-kuma&ref=e2e-app-catalog/);
    await expect(page.getByRole("heading", { name: /new pod — uptime kuma/i })).toBeVisible();

    await login(page, "approved");
    await page.goto("/start?tab=apps&ref=e2e-app-catalog");
    await page.waitForURL(/\/dashboard\/create\?tab=apps$/);
    await expect(page.getByRole("tab", { name: "Apps" })).toHaveAttribute("data-state", "active");
  });

  test("authed deep link opens the wizard prefilled — app selected, name pre-generated, Create not auto-submitted", async ({
    page,
  }) => {
    await login(page, "approved");
    await page.goto("/start?app=doc-qa&ref=e2e-prefill");
    await page.waitForURL(/\/dashboard\/pods\/new\?/);
    await expect(page.getByRole("heading", { name: /new pod — ask your docs/i })).toBeVisible();

    // Prefilled: Basics shows a non-empty, pre-generated name — but Create is nowhere on this
    // step (only Next), so nothing was auto-submitted.
    await expectStep(page, "Basics", 1, 4);
    await expect(page.getByRole("button", { name: /^create pod$/i })).toHaveCount(0);
    const nameInput = page.getByLabel("Name");
    const prefilledName = await nameInput.inputValue();
    expect(prefilledName.trim().length).toBeGreaterThan(0);
    // A name the OWNER recognises, not a random slug. The wizard deliberately prefills
    // `my <app title>` for a deep link (dashboard/pods/new/page.tsx: "Friendly, app-based default
    // the user recognises"). This asserted the old adjective-animal-4hex shape and has been failing
    // ever since that changed — testing the exact behaviour the product decided against.
    expect(prefilledName).toMatch(/^my /i);
    expect(prefilledName.toLowerCase()).toContain("ask your docs");

    // First-touch ref recorded on the account the instant /start was hit — before any Create
    // click.
    expect(await accountRef(USERS.approved.email)).toBe("e2e-prefill");

    // The user still has to walk the wizard and click Create explicitly.
    await page.getByRole("button", { name: /^next$/i }).click();
    await expectStep(page, "Agents", 2, 4);
    await page.getByRole("button", { name: /^next$/i }).click();
    await expectStep(page, "Secrets", 3, 4);
    await page.locator('input[type="password"]').first().fill("sk-e2e-placeholder");
    await page.getByRole("button", { name: /^next$/i }).click();
    await expectStep(page, "Review", 4, 4);
    const launch = page.getByRole("button", { name: /^create pod$/i });
    await expect(launch).toBeEnabled();
    await launch.click();

    await page.waitForURL(
      (u) => /^\/dashboard\/pods\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/new"),
      { timeout: 120_000 },
    );
    const slug = new URL(page.url()).pathname.split("/").pop();
    if (!slug) throw new Error(`no pod slug in setup URL: ${page.url()}`);

    // The ref active for this launch (this session's deep-link ref) landed on the pod row —
    // deeplink-onboarding's "ref is copied onto the created pod" scenario.
    await expect.poll(() => podRef(slug)).toBe("e2e-prefill");

    // The URL that redirected here carries the deep-link flag the cockpit reads to show the
    // 2-card walkthrough instead of the default coach-mark tour.
    expect(page.url()).toContain("from=deeplink");

    // The fake stack gives a freshly-launched pod a session URL almost immediately, so it
    // reaches "ready" fast — exactly when the 2-card walkthrough should appear instead of the
    // default coach-mark tour. Two steps; finishing strips the one-shot URL flag.
    //
    // This is a COACH-MARK tour, not a modal with both cards on screen at once. It was changed
    // deliberately (deeplink-walkthrough.tsx: the modal "read as a confusing duplicate of the
    // dashboard, owner report"), and the assertions below were never updated — they looked for a
    // dialog named after the card heading and a "Continue to the dashboard" button, neither of
    // which exists. The dialog is labelled "How it works"; the headings are its step titles.
    const walkthrough = page.getByRole("dialog", { name: /how it works/i });
    await expect(walkthrough).toBeVisible({ timeout: 20_000 });
    await expect(walkthrough.getByText("Your Ask Your Docs is live")).toBeVisible();
    // Step 2 is reached by advancing, not by being on screen already.
    await walkthrough.getByRole("button", { name: /^next$/i }).click();
    await expect(walkthrough.getByText("Steer it from Claude")).toBeVisible();
    await walkthrough.getByRole("button", { name: /^done$/i }).click();
    await expect(walkthrough).toHaveCount(0);
    // The flag is stripped by a router.replace inside the dismiss handler (pod-cockpit.tsx
    // dismissDeeplinkWalkthrough), which lands AFTER the dialog unmounts — reading page.url()
    // straight away races it.
    // 15s, not the 5s default: the replace lands after a dev-server render and blew the default
    // once in three runs. The walkthrough assertion above already allows 20s for the same reason.
    await expect
      .poll(() => page.url(), { timeout: 15_000 })
      .not.toContain("from=deeplink");
  });

  // A BYO-repo env keeps sign-in FIRST (its repo picker needs a GitHub login); other app links show the
  // wizard first (see "an anonymous app link shows the wizard…").
  test("unauthenticated deep link is carried through sign-in via next=, not a bare query param", async ({
    page,
  }) => {
    await page.goto("/start?app=byo-project&ref=e2e-oauth");
    await page.waitForURL(/\/signin\?next=/);
    const next = new URL(page.url()).searchParams.get("next");
    expect(next).toBeTruthy();
    // The carried destination is /start itself (re-entered once authed) with both app+ref
    // intact — this is what becomes better-auth's callbackURL, which GitHub's OAuth `state`
    // round-trips back (signin-experience delta). A real GitHub OAuth round-trip can't run
    // headless in this suite (no live GitHub app here); this proves the carrier is correct.
    const decoded = new URL(next!, "http://localhost");
    expect(decoded.pathname).toBe("/start");
    expect(decoded.searchParams.get("app")).toBe("byo-project");
    expect(decoded.searchParams.get("ref")).toBe("e2e-oauth");

    // Sign in (test-login) and follow the carried destination — the same thing an OAuth
    // callback landing on `next` would do.
    await login(page, "approved");
    await page.goto(next!);
    await page.waitForURL(/\/dashboard\/pods\/new\?.*env=byo-project/);
    expect(await accountRef(USERS.approved.email)).toBe("e2e-oauth");
  });

  test("a normal sign-in (no deep link) is unaffected", async ({ page }) => {
    await login(page, "approved");
    expect(await accountRef(USERS.approved.email)).toBeNull();
  });
});

test.describe("first-touch ref from ANY landing (the ref cookie)", () => {
  test("a landing opened with ?ref= credits that ref even when its button drops it", async ({ page }) => {
    await clearAccountRef(USERS.approved.email);
    // A creator links to /agent-computer?ref=…; its Start button goes to /signin with no ref.
    await page.goto("/agent-computer?ref=e2e-creator-cookie");
    await page.goto("/agent-computer?ref=e2e-later-link"); // a later link never replaces the first touch
    await login(page, "approved");
    await page.goto("/dashboard");
    await expect.poll(() => accountRef(USERS.approved.email)).toBe("e2e-creator-cookie");
    expect(await accountRef(USERS.approved.email)).toBe("e2e-creator-cookie"); // and it stays
  });
});
