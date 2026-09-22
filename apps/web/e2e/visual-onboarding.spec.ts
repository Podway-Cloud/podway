import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// VISUAL capture of the deep-link create flow, step by step, for the onboarding audit.
// Run: pnpm exec playwright test e2e/visual-onboarding.spec.ts
// Output dir via VISUAL_OUT (default /tmp/visual-onboarding).
const OUT = process.env.VISUAL_OUT || "/tmp/visual-onboarding";
const APP = "doc-qa"; // a catalog app the e2e stack knows

test("VISUAL onboarding — /start deeplink → signin → wizard → create → walkthrough", async ({ page }) => {
  // no-expect-ok: VISUAL capture for human review — screenshots, not functional assertions.
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 950 });

  // 1) UNAUTHENTICATED deep link → carried to /signin via next=
  await page.goto(`/start?app=${APP}&ref=audit`);
  await page.waitForURL(/\/signin\?next=/, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/01-signin-carried.png`, fullPage: true });

  // 2) Sign in (test-login stands in for GitHub OAuth), then re-enter the carried deep link
  await login(page, "approved");
  await page.goto(`/start?app=${APP}&ref=audit`);
  await page.waitForURL(/\/dashboard\/pods\/new\?/, { timeout: 30_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/02-wizard-basics.png`, fullPage: true });

  // 3) Walk the 4-step wizard, screenshotting each
  const next = () => page.getByRole("button", { name: /^next$/i });
  const shot = async (n: string) => { await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/${n}`, fullPage: true }); };
  await next().click(); await shot("03-wizard-agents.png");
  await next().click(); await shot("04-wizard-secrets.png");
  // secrets step may want a value
  const pw = page.locator('input[type="password"]').first();
  if (await pw.isVisible().catch(() => false)) await pw.fill("sk-audit-placeholder");
  await next().click(); await shot("05-wizard-review.png");

  // 4) Create → pod cockpit + the deep-link 2-card walkthrough
  await page.getByRole("button", { name: /^create pod$/i }).click();
  await page.waitForURL((u) => /^\/dashboard\/pods\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/new"), { timeout: 120_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/06-cockpit-walkthrough-1.png`, fullPage: true });
  const dlg = page.getByRole("dialog", { name: /how it works/i });
  if (await dlg.isVisible().catch(() => false)) {
    const wnext = dlg.getByRole("button", { name: /^next$/i });
    if (await wnext.isVisible().catch(() => false)) { await wnext.click(); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/07-cockpit-walkthrough-2.png`, fullPage: true }); }
  }
});

test("pricing-card size deeplink opens a blank workspace with that size preselected", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 950 });
  await login(page, "approved");
  // The landing pricing card links to /start?size=<id>&ref=pricing (no app → blank workspace).
  await page.goto("/start?size=xl&ref=pricing");
  await page.waitForURL(/\/dashboard\/pods\/new\?/, { timeout: 30_000 });
  const u = new URL(page.url());
  expect(u.searchParams.get("env")).toBe("byo-project"); // size-only → the blank BYO workspace
  expect(u.searchParams.get("size")).toBe("xl");
  expect(u.searchParams.get("from")).toBe("deeplink");
  // XL is the preselected size (would be Medium/minSize without the ?size wiring).
  await expect(page.getByRole("button", { name: /\bXL\b/ })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/11-pricing-deeplink-xl.png`, fullPage: true });
});

test("VISUAL onboarding — the catalog + billing (where the $15 / card lives)", async ({ page }) => {
  // no-expect-ok: VISUAL capture for human review.
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 950 });
  await login(page, "approved");
  // The catalog an unknown app / no-app user lands on
  await page.goto("/dashboard/create");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/08-catalog.png`, fullPage: true });
  await page.goto("/dashboard/create?tab=apps");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/09-catalog-apps.png`, fullPage: true });
  // Billing — where the card + signup credit surface today
  await page.goto("/dashboard/billing");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/10-billing.png`, fullPage: true });
});
