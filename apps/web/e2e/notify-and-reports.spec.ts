import { test, expect } from "@playwright/test";
import { login, launchPod } from "./helpers";

test.describe("notifications + bug reports", () => {
  // Settings toggles are switches (owner, 2026-10-14), not Turn on/off buttons.
  test("Settings → turn login reminder emails off; it persists across a reload", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/dashboard/settings");
    const sw = page.getByRole("switch", { name: "Login reminder emails" });
    await expect(sw).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    await page.reload();
    await expect(sw).toHaveAttribute("aria-checked", "false", { timeout: 30_000 });
    await sw.click(); // leave the shared user as found
    await expect(sw).toHaveAttribute("aria-checked", "true");
  });

  // Night auto-update: ON by default (owner, 2026-10-15); switching it stores the browser's timezone.
  test("Settings → night updates are on by default; switching keeps the timezone", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/dashboard/settings");
    const card = page.locator("section", { hasText: "Update idle pods automatically at night" });
    const sw = page.getByRole("switch", { name: "Update idle pods automatically at night" });
    await expect(sw).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    const tz = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    await page.reload();
    await expect(sw).toHaveAttribute("aria-checked", "false", { timeout: 30_000 });
    await expect(card.getByText(`(${tz})`)).toBeVisible();
    await sw.click(); // leave the shared user as found
    await expect(sw).toHaveAttribute("aria-checked", "true");
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
