import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Owner report (iPhone, 2026-09): returning to a page left open a while, you can't scroll to the top
 * and there's an empty band at the bottom; a refresh fixes it.
 *
 * Cause: the shell height was chased in JS (`--app-h`), then set to `100dvh` — both kept going stale
 * on iOS after a bfcache restore. The fix (2026-09-11) is pure CSS `height: 100svh` on the fixed
 * `#app-shell` — the SMALL (static) viewport height. Because the body never scrolls, Safari's URL bar
 * never auto-hides, so svh matches the visible viewport permanently AND can't go stale (no JS at all).
 *
 * WHAT THIS TEST CAN AND CANNOT DO: the iOS bfcache staleness itself is NOT reproducible in headless
 * Chromium, so this pins the MECHANISM: the shell is a single fixed viewport-height box that fills the
 * viewport and contains its own scroll (the body never scrolls). Whether that cures the iPhone is an
 * OWNER check, recorded as one — not implied by a green test.
 */
test.describe("mobile: the shell is a single fixed 100svh box", () => {
  test("#app-shell fills the viewport and tracks its height", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "approved");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const shellH = () => page.locator("#app-shell").evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(await shellH()).toBe(844); // 100dvh === the viewport in Chromium

    await page.setViewportSize({ width: 390, height: 700 });
    await page.waitForTimeout(200);
    expect(await shellH()).toBe(700);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    expect(await shellH()).toBe(844);
  });

  test("the body does not scroll — only the shell's <main> does", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, "approved");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // A fixed, overflow-hidden shell means the document itself never overflows the viewport — the whole
    // point (a body that scrolls is what stranded the top after a stale-tall height).
    const bodyOverflow = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(bodyOverflow).toBeLessThanOrEqual(1);
  });
});
