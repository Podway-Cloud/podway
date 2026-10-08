import { test, expect, devices } from "@playwright/test";
import { login, launchPod } from "./helpers";

/**
 * Pod cards on a PHONE (owner, 2026-09-30, after whole-card drag shipped: "can't select a pod card at
 * all now — I hold my finger, feel a short vibration, and nothing happens"). A tap must open the pod.
 * Pods are created in a desktop window (the launch helper is desktop-shaped), then checked on a phone.
 */
test("on a phone: a tap opens the pod; a long-press + move reorders", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await login(page, "approved");
  // Unique per attempt: a retry must not find the first attempt's cards too (strict-mode clash, CI 2026-10-08).
  const tag = `t${test.info().retry}`;
  await launchPod(page, "nextjs-starter", { name: `touch-a${tag}` });
  await launchPod(page, "nextjs-starter", { name: `touch-b${tag}` });
  const phone = await browser.newContext({ ...devices["iPhone 13"], baseURL: test.info().project.use.baseURL });
  const m = await phone.newPage();
  await login(m, "approved");
  await m.goto("/dashboard");
  const card = m.getByTestId("pod-card").filter({ has: m.getByRole("button", { name: `Reorder touch-a${tag}` }) });
  await expect(card).toBeVisible();
  const names = () => m.getByTestId("pod-card").locator("button[aria-label^='Reorder ']").evaluateAll((els, t) =>
    els.map((e) => e.getAttribute("aria-label")!.replace("Reorder ", "")).filter((n) => n.endsWith(t) && n.startsWith("touch-")),
  tag);
  await expect.poll(async () => (await names()).length).toBe(2);
  const before = await names();

  // Long-press (0.5 s > the 0.4 s pick-up) on the first card, then move it below the second.
  const cardOf = (n: string) => m.getByTestId("pod-card").filter({ has: m.getByRole("button", { name: `Reorder ${n}` }) });
  const a = (await cardOf(before[0]!).boundingBox())!;
  const b = (await cardOf(before[1]!).boundingBox())!;
  const cdp = await phone.newCDPSession(m);
  const x = a.x + a.width / 2, y0 = a.y + a.height / 2, y1 = b.y + b.height * 0.8;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  await m.waitForTimeout(550);
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 12 }] });
    await m.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(names).toEqual([before[1], before[0]]);
  await expect(m).toHaveURL(/\/dashboard\/?$/); // the drag did not open a pod

  // A plain tap opens the pod.
  const box = (await cardOf(before[0]!).boundingBox())!;
  await m.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  // 30 s: the first visit to the pod page compiles it on the CI dev server (cold compile > 10 s seen in CI).
  await expect(m).toHaveURL(/\/dashboard\/pods\//, { timeout: 30_000 });
  await phone.close();
});
