import { test, expect } from "@playwright/test";
import { login, launchPod } from "./helpers";

/**
 * Drag-to-reorder pod cards on the dashboard (owner report 2026-09-29: "almost impossible to grab a
 * card by the grip — it either selects the whole card or the pod name"). The WHOLE card is the drag
 * target now: drag from the card's middle, not the grip; the order shows at once AND survives a reload;
 * and a plain click still opens the pod.
 */
test("pod cards reorder by dragging anywhere on the card, and the order persists", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, "approved");
  // A unique prefix per run: the shared test user keeps pods from earlier runs and retries, and a fixed
  // "drag-" prefix then counted 4 cards instead of 2 (CI flake, 2026-10-14).
  const p = `drag${Date.now().toString(36)}-`;
  await launchPod(page, "nextjs-starter", { name: `${p}a` });
  await launchPod(page, "nextjs-starter", { name: `${p}b` });
  await page.goto("/dashboard");
  const names = () => page.getByTestId("pod-card").locator("button[aria-label^='Reorder ']").evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label")!.replace("Reorder ", "")),
  );
  await expect.poll(async () => (await names()).filter((n) => n.startsWith(p)).length).toBe(2);
  const before = (await names()).filter((n) => n.startsWith(p));

  // Grab each card by its MIDDLE (the name/status area), not the 24 px grip. Retried: both pods are still
  // starting, so their cards change height mid-drag and a drop can land off target (CI flake, 2026-10-14). A
  // broken drag fails every try, so this cannot hide a real regression.
  await expect(async () => {
    const order = (await names()).filter((n) => n.startsWith(p));
    if (order[0] === before[1]) return; // already swapped by an earlier try
    const first = page.getByTestId("pod-card").filter({ has: page.getByRole("button", { name: `Reorder ${before[0]}` }) });
    const second = page.getByTestId("pod-card").filter({ has: page.getByRole("button", { name: `Reorder ${before[1]}` }) });
    const a = (await first.boundingBox())!;
    const b = (await second.boundingBox())!;
    const x = a.x + a.width / 2, y0 = a.y + a.height / 2;
    await page.mouse.move(x, y0);
    await page.mouse.down();
    // move in steps past the 8 px activation distance, to below the second card's middle
    const y1 = b.y + b.height * 0.75;
    for (let i = 1; i <= 12; i++) await page.mouse.move(x, y0 + ((y1 - y0) * i) / 12);
    await page.mouse.up();
    await expect(page).toHaveURL(/\/dashboard\/?$/); // the release after a drag did NOT open the pod
    await expect.poll(async () => (await names()).filter((n) => n.startsWith(p)), { timeout: 5_000 }).toEqual([before[1], before[0]]);
  }).toPass({ timeout: 60_000 });
  await page.reload();
  await expect.poll(async () => (await names()).filter((n) => n.startsWith(p))).toEqual([before[1], before[0]]);

  // A plain click (no movement) still opens the pod's cockpit.
  await page.getByTestId("pod-card").filter({ has: page.getByRole("button", { name: `Reorder ${before[0]}` }) }).click();
  await expect(page).toHaveURL(/\/dashboard\/pods\//);
});
