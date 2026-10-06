import { test, expect } from "@playwright/test";

/**
 * The homepage A/B (landing-computer-vs-selfhost-2026-10) SERVES each visitor their assigned arm: a
 * selfhost-arm visitor sees the self-hosted AI admin landing at `/`, an agent-computer visitor sees
 * the agent-computer one. Assignment itself is unit-tested; this proves the root renders the arm.
 */
const COOKIE = "pb_landing_computer_vs_selfhost_variant";

for (const [variant, heading] of [
  ["selfhost", /Self-host the tools you need/],
  ["agent-computer", /always-on computer/],
] as const) {
  test(`the ${variant} arm is served at /`, async ({ page, context, baseURL }) => {
    await context.addCookies([
      { name: COOKIE, value: variant, url: baseURL! },
      { name: "pb_landing_visitor", value: "visitor_1234567890abcdef", url: baseURL! },
    ]);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  });
}
