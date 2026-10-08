import { test, expect } from "@playwright/test";

test.describe("landing free offer + removed pages", () => {
  test("/pricing is gone (redirects to the landing pricing); the landing shows the free offer, no 'alpha'", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/#pricing$/);
    await page.goto("/selfhost");
    await expect(page.getByText("Your first app is free during early access. No card needed.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start free" }).first()).toBeVisible();
    await expect(page.getByText(/alpha/i)).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/landing-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: "test-results/landing-desktop.png" });
  });

  test("/apps and /radar are removed (owner, 2026-10-08) and redirect to the landing", async ({ page }) => {
    await page.goto("/apps/umami");
    await expect(page).toHaveURL(/\/#apps$/);
    await page.goto("/radar");
    await expect(page).toHaveURL(/\/$/);
  });
});
