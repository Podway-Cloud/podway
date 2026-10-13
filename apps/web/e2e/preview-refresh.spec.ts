import { test, expect } from "@playwright/test";
import { login, launchPod, waitForPodReady } from "./helpers";

/**
 * Cockpit preview refreshes WITHOUT a flash (owner, 2026-10-11). The auto refreshes at 5 s / 13 s (the
 * n8n stale-first-render fix) used to re-key the visible iframe, so every cockpit open flashed twice.
 * Now a refresh loads in a hidden frame and only becomes visible AFTER it has loaded — and exactly one
 * frame is visible at every moment.
 */
test("the live preview refreshes behind the scenes: never a loading frame on screen", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "approved");
  const slug = await launchPod(page);
  await waitForPodReady(page, slug);
  // Watch every preview iframe: when it fired `load`, and when it became the visible one.
  await page.addInitScript(() => {
    const w = window as unknown as { __pv: { loaded: Map<Element, number>; shownBeforeLoad: number; maxVisible: number; frames: number } };
    w.__pv = { loaded: new Map(), shownBeforeLoad: 0, maxVisible: 0, frames: 0 };
    const seen = new WeakSet<Element>();
    const check = () => {
      const frames = [...document.querySelectorAll('iframe[title="Pod preview"]')];
      for (const f of frames) {
        if (!seen.has(f)) {
          seen.add(f);
          w.__pv.frames++;
          f.addEventListener("load", () => w.__pv.loaded.set(f, performance.now()));
        }
      }
      const visible = frames.filter((f) => f.classList.contains("opacity-100"));
      w.__pv.maxVisible = Math.max(w.__pv.maxVisible, visible.length);
      // A frame that is visible but never loaded, while another one exists, is the flash we removed.
      // (The very first frame is visible from the start by design.)
      if (w.__pv.frames > 1) for (const f of visible) if (!w.__pv.loaded.has(f)) w.__pv.shownBeforeLoad++;
    };
    new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });
  await page.goto(`/dashboard/pods/${slug}`);
  await expect(page.locator('iframe[title="Pod preview"]').first()).toBeAttached({ timeout: 30_000 });
  await page.waitForTimeout(17_000); // past both auto refreshes (5 s, 13 s) + settle
  const pv = await page.evaluate(() => {
    const w = window as unknown as { __pv: { shownBeforeLoad: number; maxVisible: number; frames: number } };
    return { shownBeforeLoad: w.__pv.shownBeforeLoad, maxVisible: w.__pv.maxVisible, frames: w.__pv.frames };
  });
  expect(pv.frames).toBeGreaterThanOrEqual(3); // first frame + the two refreshes really happened
  expect(pv.shownBeforeLoad).toBe(0);
  expect(pv.maxVisible).toBe(1);
  await expect(page.locator('iframe[title="Pod preview"].opacity-100')).toHaveCount(1);
});
