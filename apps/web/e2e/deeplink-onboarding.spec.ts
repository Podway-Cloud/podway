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

  test("unknown app falls back to the catalog — no error, no launch", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/start?app=does-not-exist&ref=e2e-unknown");
    await page.waitForURL(/\/dashboard\/create/);
    // First-touch ref still records even though the app fell back — attribution and the app
    // pick are independent (spec: "unknown app falls back safely").
    expect(await accountRef(USERS.approved.email)).toBe("e2e-unknown");
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
    // The control-plane slug shape: adjective-animal-4hex.
    expect(prefilledName).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{4}$/);

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
    // default coach-mark tour. Exactly two cards; dismissing strips the one-shot URL flag.
    const walkthrough = page.getByRole("dialog", { name: /your ask your docs is live/i });
    await expect(walkthrough).toBeVisible({ timeout: 20_000 });
    await expect(walkthrough.getByText("Your Ask Your Docs is live")).toBeVisible();
    await expect(walkthrough.getByText("Steer it from Claude")).toBeVisible();
    await walkthrough.getByRole("button", { name: /continue to the dashboard/i }).click();
    await expect(walkthrough).toHaveCount(0);
    expect(page.url()).not.toContain("from=deeplink");
  });

  test("unauthenticated deep link is carried through sign-in via next=, not a bare query param", async ({
    page,
  }) => {
    await page.goto("/start?app=doc-qa&ref=e2e-oauth");
    await page.waitForURL(/\/signin\?next=/);
    const next = new URL(page.url()).searchParams.get("next");
    expect(next).toBeTruthy();
    // The carried destination is /start itself (re-entered once authed) with both app+ref
    // intact — this is what becomes better-auth's callbackURL, which GitHub's OAuth `state`
    // round-trips back (signin-experience delta). A real GitHub OAuth round-trip can't run
    // headless in this suite (no live GitHub app here); this proves the carrier is correct.
    const decoded = new URL(next!, "http://localhost");
    expect(decoded.pathname).toBe("/start");
    expect(decoded.searchParams.get("app")).toBe("doc-qa");
    expect(decoded.searchParams.get("ref")).toBe("e2e-oauth");

    // Sign in (test-login) and follow the carried destination — the same thing an OAuth
    // callback landing on `next` would do.
    await login(page, "approved");
    await page.goto(next!);
    await page.waitForURL(/\/dashboard\/pods\/new\?/);
    await expect(page.getByRole("heading", { name: /new pod — ask your docs/i })).toBeVisible();
    expect(await accountRef(USERS.approved.email)).toBe("e2e-oauth");
  });

  test("a normal sign-in (no deep link) is unaffected", async ({ page }) => {
    await login(page, "approved");
    expect(await accountRef(USERS.approved.email)).toBeNull();
  });
});
