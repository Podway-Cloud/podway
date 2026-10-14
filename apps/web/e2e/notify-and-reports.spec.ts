import { test, expect } from "@playwright/test";
import { login, launchPod } from "./helpers";

test.describe("notifications + bug reports", () => {
  test("Settings → turn login reminder emails off; it persists across a reload", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/dashboard/settings");
    await expect(page.getByText("Login reminder emails")).toBeVisible({ timeout: 30_000 });
    const card = page.locator("section", { hasText: "Login reminder emails" });
    await card.getByRole("button", { name: /^Turn off$/ }).click();
    await expect(card.getByRole("button", { name: /^Turn on$/ })).toBeVisible();
    await page.reload();
    await expect(card.getByRole("button", { name: /^Turn on$/ })).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: /^Turn on$/ }).click(); // leave the shared user as found
    await expect(card.getByRole("button", { name: /^Turn off$/ })).toBeVisible();
  });

  // Night auto-update (owner, 2026-10-13): off by default; turning it on stores the browser's timezone.
  test("Settings → night updates are off by default; turning them on keeps the timezone", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/dashboard/settings");
    const card = page.locator("section", { hasText: "Update idle pods automatically at night" });
    await expect(card.getByRole("button", { name: /^Turn on$/ })).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: /^Turn on$/ }).click();
    await expect(card.getByRole("button", { name: /^Turn off$/ })).toBeVisible();
    const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    await page.reload();
    await expect(card.getByText(`(${tz})`)).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: /^Turn off$/ }).click(); // leave the shared user as found
    await expect(card.getByRole("button", { name: /^Turn on$/ })).toBeVisible();
  });

  test("Cockpit → Insights → Reports shows the pod's bug reports (empty state)", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, "approved");
    const slug = await launchPod(page);
    await page.goto(`/dashboard/pods/${slug}?tab=insights`);
    await page.getByRole("tab", { name: /^Reports$/ }).click();
    await expect(page.getByText(/No bug reports from this pod/)).toBeVisible({ timeout: 30_000 });
  });
});
