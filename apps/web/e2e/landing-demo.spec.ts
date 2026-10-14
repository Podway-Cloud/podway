import { test, expect } from "@playwright/test";
import { pinLandingArm } from "./helpers";

/**
 * The "Commute" demo film on the landing (2026-09-29). It lives in a same-origin frame, as the hero visual
 * since 2026-10-14. Guards: the frame loads the film, the film starts once it is in view, and the frame is tall
 * enough that nothing inside needs its own scrollbar, at desktop and phone widths.
 */
for (const width of [1280, 400, 320]) {
  test(`landing demo film loads, plays, and fits its frame at ${width}px`, async ({ page, context, baseURL }) => {
    await pinLandingArm(context, baseURL!, "agent-computer"); // the film lives on the agent-computer arm
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const frameEl = page.locator('iframe[src="/landing/commute-demo.html"]');
    await frameEl.scrollIntoViewIfNeeded();
    const film = page.frameLocator('iframe[src="/landing/commute-demo.html"]');
    // The film is the hero visual (2026-10-14): it sits in the hero, next to the H1.
    await expect(page.locator("figure", { has: frameEl })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/a computer that never sleeps/);
    // Playing = the caption moves past its initial text once the stage is in view.
    await expect(film.locator("#cap")).toHaveText(/Ask for what you want/i, { timeout: 30_000 });
    const frame = await frameEl.elementHandle();
    // The frame hugs the film: never clipped, and no empty band under it (the 2026-09-29 ~600 px gap).
    const inner = await (await frame!.contentFrame())!.evaluate(
      () => document.querySelector(".wrap")!.getBoundingClientRect().height,
    );
    const outer = (await frameEl.boundingBox())!.height;
    expect(Math.abs(outer - inner)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `test-results/landing-demo-${width}.png` });
  });
}
