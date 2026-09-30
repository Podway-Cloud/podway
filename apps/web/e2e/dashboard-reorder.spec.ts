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
  await launchPod(page, "nextjs-starter", { name: "drag-a" });
  await launchPod(page, "nextjs-starter", { name: "drag-b" });
  await page.goto("/dashboard");
  const names = () => page.getByTestId("pod-card").locator("button[aria-label^='Reorder ']").evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label")!.replace("Reorder ", "")),
  );
  await expect.poll(async () => (await names()).filter((n) => n.startsWith("drag-")).length).toBe(2);
  const before = (await names()).filter((n) => n.startsWith("drag-"));

  // Grab each card by its MIDDLE (the name/status area), not the 24 px grip.
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

  await expect.poll(async () => (await names()).filter((n) => n.startsWith("drag-"))).toEqual([before[1], before[0]]);
  await page.reload();
  await expect.poll(async () => (await names()).filter((n) => n.startsWith("drag-"))).toEqual([before[1], before[0]]);

  // A plain click (no movement) still opens the pod's cockpit.
  await page.getByTestId("pod-card").filter({ has: page.getByRole("button", { name: `Reorder ${before[0]}` }) }).click();
  await expect(page).toHaveURL(/\/dashboard\/pods\//);
});
