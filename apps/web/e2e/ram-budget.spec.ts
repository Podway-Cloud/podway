import { test, expect } from "@playwright/test";
import { login, launchPod } from "./helpers";

/**
 * The RAM-budget launch gate in the browser (test-reliability 2.5). A no-card account has a 16 GB
 * budget (ACCOUNT_RAM_GB) and XL is exactly 16 GB, so after ONE default pod (Medium, 4 GB) an XL no
 * longer fits while a Large (8 GB) still does. The gate must BLOCK Create and say how to get out
 * (suspend a pod / contact support) — and must not block a size that fits.
 *
 * The carded budget (CARDED_RAM_GB) needs Stripe configured, which the e2e stack is not; that half
 * is covered by apps/web/test/account-ram-cap.test.ts, and the server-side refusal by
 * packages/control-plane/test/account-ram-budget.test.ts.
 */
test.describe("RAM-budget launch gate", () => {
  test("no-card account: XL over budget is blocked with a way out; Large still fits", async ({ page }) => {
    await login(page, "ramcap");
    await launchPod(page, "nextjs-starter", { name: "ram-filler" }); // Medium = 4 GB used

    // Pick the size by clicking it, like a person: the wizard's session draft wins over `?size=`.
    const reviewFor = async (size: "XL" | "Large") => {
      await page.goto("/dashboard/pods/new?env=nextjs-starter");
      await page.locator("#pod-name").fill(`ram-${size.toLowerCase()}`);
      const pick = page.getByRole("button", { name: new RegExp(`\\b${size}\\b`) });
      await pick.click();
      await expect(pick).toHaveAttribute("aria-pressed", "true");
      for (let guard = 0; guard < 6; guard++) {
        if ((await page.getByRole("button", { name: /^create pod$/i }).count()) > 0) return;
        await page.getByRole("button", { name: /^next$/i }).click();
      }
      throw new Error("never reached the Review step");
    };

    // XL (16 GB) against 12 GB free → blocked, with the reason and the way out.
    await reviewFor("XL");
    await expect(page.getByRole("button", { name: /^create pod$/i })).toBeDisabled();
    await expect(page.getByText(/This 16 GB pod won’t fit your 12 GB free/)).toBeVisible();

    // The Basics step shows the same budget line in the destructive tone, with a support link.
    await page.getByRole("button", { name: /^back$/i }).click();
    for (let guard = 0; guard < 6 && (await page.locator("#pod-name").count()) === 0; guard++) {
      await page.getByRole("button", { name: /^back$/i }).click();
    }
    const budget = page.getByText(/Uses 16 GB of your 12 GB free/);
    await expect(budget).toBeVisible();
    await expect(budget).toHaveClass(/text-destructive/);
    await expect(page.getByRole("button", { name: "contact support" })).toBeVisible();

    // Large (8 GB) fits the same 12 GB → Create is enabled.
    await reviewFor("Large");
    await expect(page.getByRole("button", { name: /^create pod$/i })).toBeEnabled();
  });
});
