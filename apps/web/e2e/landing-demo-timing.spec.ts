import { test, expect } from "@playwright/test";

/**
 * The Commute film's TIMING MODEL, audited on one full play (owner, 2026-09-29: "rushing" in places,
 * "huge pauses" in others, "hard to follow"). Rules — the same ones the film's `T` constants encode:
 *  1. every caption is on screen for its reading time (0.5 s + 0.25 s/word) before its action;
 *  2. every result stays ≥ 0.8 s before the next caption replaces the context (not rushed);
 *  3. never more than 2.6 s without any change on screen (not stuck);
 *  4. the time cards and end card are fully opaque;
 *  5. it plays once and rests on the end card (no auto-replay), which offers the sign-up CTA;
 *  6. no caption is left over while a time card covers the scene (it described the scene before).
 */
test("the Commute film follows its timing model", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/landing/commute-demo.html");
  await page.evaluate(() => {
    const w = window as unknown as { __log: [number, string, string][] };
    w.__log = [];
    const t0 = performance.now();
    const L = (k: string, v: string) => w.__log.push([Math.round(performance.now() - t0), k, v]);
    const watched = ["s-dash", "s-claude", "p-lock", "p-chat", "p-web", "dev-desk", "dev-phone", "tcard", "end", "still", "desk", "nb", "openbtn", "finger", "paybtn", "cursor"];
    new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target as HTMLElement;
        if (el.id === "cap") { if (m.type === "childList") L("CAP", el.textContent ?? ""); continue; }
        if (el.id === "pausedchip" || el.id === "pp") continue;
        if (m.type === "attributes" && el.id === "tcard") L("CARD", el.classList.contains("on") ? "on" : "off");
        if (m.type === "attributes" && watched.includes(el.id)) { L("ACT", `${el.id}:${m.attributeName}`); continue; }
        if (m.type === "childList" && m.addedNodes.length) L("ACT", `${el.id || el.className}+`);
        if (m.type === "characterData") L("ACT", "text");
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "style"] });
  });
  await page.waitForFunction(() => document.getElementById("end")!.classList.contains("on"), null, { timeout: 150_000 });
  await page.waitForTimeout(12_000);
  const log = await page.evaluate(() => (window as unknown as { __log: [number, string, string][] }).__log);
  const words = (t: string) => (t.match(/\S+/g) ?? []).length;
  const fails: string[] = [];
  const endAt = log.find(([, k, v]) => k === "ACT" && v.startsWith("end:"))?.[0] ?? Infinity;
  log.forEach(([t, k, v], i) => {
    if (k !== "CAP" || !v) return;
    const next = log.slice(i + 1).find(([, k2]) => k2 === "ACT");
    const need = 500 + 250 * words(v);
    if (next && next[0] - t < need - 60) fails.push(`caption too short: "${v}" ${next[0] - t} < ${need} ms`);
    const prev = log.slice(0, i).filter(([, k2]) => k2 === "ACT").pop();
    if (prev && i > 1 && t - prev[0] < 800) fails.push(`rushed: "${v}" ${t - prev[0]} ms after the last change`);
  });
  const times = log.map(([t]) => t).filter((t) => t <= endAt);
  for (let i = 1; i < times.length; i++) {
    if (times[i]! - times[i - 1]! > 2600) fails.push(`stuck: ${times[i]! - times[i - 1]!} ms without change at ${times[i - 1]} ms`);
  }
  for (const id of ["tcard", "end"]) {
    const bg = await page.evaluate((i) => getComputedStyle(document.getElementById(i)!).backgroundColor, id);
    if (/rgba\(.*,\s*0?\.\d+\)/.test(bg)) fails.push(`${id} is translucent: ${bg}`);
  }
  // 6. while a time card is up (from 600 ms after it appears), the caption is empty
  let cardOn = -1, caption = "";
  for (const [t, k, v] of log) {
    if (k === "CAP") caption = v;
    // Checked at every event AND when the card leaves: under a solid card nothing else changes.
    if (cardOn >= 0 && t - cardOn > 600 && caption) fails.push(`caption "${caption}" still shown over a time card at ${t} ms`);
    if (k === "CARD") cardOn = v === "on" ? t : -1;
  }
  expect(fails).toEqual([]);
  expect(await page.evaluate(() => document.getElementById("end")!.classList.contains("on"))).toBe(true); // no auto-replay
  await expect(page.locator("#end a.cta")).toHaveText("Start with Podway");
  await expect(page.locator("#end a.cta")).toHaveAttribute("target", "_top");
  await expect(page.locator("#pp")).toHaveText(/Watch again/);
});
