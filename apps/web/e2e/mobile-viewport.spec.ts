import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Owner report (2026-09-07, iPhone): "when I don't open a page in mobile for some time and then
 * come back to it, I can't scroll to the top and the bottom has an empty area. After refresh all
 * goes to normal."
 *
 * Cause: the shell was `h-dvh`, and iOS Safari does not reliably recompute `dvh` on a bfcache
 * restore or when returning to a long-backgrounded tab, so the shell keeps a height from when the
 * address bar was in a different state — taller than the viewport, which puts the top of the
 * scroller above the fold and leaves dead space below.
 *
 * WHAT THIS TEST CAN AND CANNOT DO: the iOS behaviour itself is NOT reproducible in headless
 * Chromium — Chromium recomputes dvh correctly, and an earlier version of this file passed
 * identically with the fix reverted, which made it worthless. So this pins the MECHANISM instead:
 * `--app-h` is published and tracks the viewport. Whether that cures the iPhone is an owner check,
 * and it is recorded as one rather than implied by a green test.
 */
test.describe("mobile: the shell height is driven by a measured value, not by dvh alone", () => {
  test("--app-h is published and tracks viewport changes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "approved");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const readVar = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-h").trim());

    expect(await readVar()).toBe("844px");

    await page.setViewportSize({ width: 390, height: 700 });
    await page.waitForTimeout(300);
    expect(await readVar()).toBe("700px"); // the resize path

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    expect(await readVar()).toBe("844px");
  });

  test("the shell actually CONSUMES the variable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "approved");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Forcing the variable to a wrong value must visibly change the shell — that proves the height
    // comes from --app-h and not from dvh, which is the whole point of the change.
    await page.evaluate(() => document.documentElement.style.setProperty("--app-h", "300px"));
    await page.waitForTimeout(200);
    const h = await page.locator("div.flex").first().evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.round(h)).toBe(300);
  });
});
