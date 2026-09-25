import { test, expect } from "@playwright/test";
import { login, launchPod } from "./helpers";

test.describe("notifications + bug reports", () => {
  test("Settings → turn login reminder emails off; it persists across a reload", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/dashboard/settings");
    await expect(page.getByText("Login reminder emails")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /^Turn off$/ }).click();
    await expect(page.getByRole("button", { name: /^Turn on$/ })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: /^Turn on$/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /^Turn on$/ }).click(); // leave the shared user as found
    await expect(page.getByRole("button", { name: /^Turn off$/ })).toBeVisible();
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
