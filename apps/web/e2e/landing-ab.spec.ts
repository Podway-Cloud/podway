import { test, expect } from "@playwright/test";

/**
 * The homepage A/B (landing-computer-vs-selfhost-2026-10) SERVES each visitor their assigned arm: a
 * selfhost-arm visitor sees the self-hosted AI admin landing at `/`, an agent-computer visitor sees
 * the agent-computer one. Assignment itself is unit-tested; this proves the root renders the arm.
 */
const COOKIE = "pb_landing_computer_vs_selfhost_variant";

for (const [variant, heading] of [
  ["selfhost", /Self-host anything/],
  ["agent-computer", /always-on computer/],
] as const) {
  test(`the ${variant} arm is served at /`, async ({ page, context, baseURL }) => {
    await context.addCookies([
      { name: COOKIE, value: variant, url: baseURL! },
      // Even last hex digit → today's first screen (the selfhost arm's hero split, below).
      { name: "pb_landing_visitor", value: "visitor_1234567890abcdee", url: baseURL! },
    ]);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
  });
}

// Owner picked Draft B (2026-10-14): inside the selfhost arm, an ODD last hex digit of the visitor id
// gets the "upkeep" first screen, and its exposure is stored with item "hero-upkeep".
test("half the selfhost arm sees the upkeep first screen, recorded on the exposure", async ({ page, context, baseURL }) => {
  const visitor = "visitor_1234567890abcdef";
  await context.addCookies([
    { name: COOKIE, value: "selfhost", url: baseURL! },
    { name: "pb_landing_visitor", value: visitor, url: baseURL! },
  ]);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/without the sysadmin work/);
  const { Client } = await import("pg");
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const { dbUrl } = JSON.parse(readFileSync(path.join(process.cwd(), ".e2e-state.json"), "utf8")) as { dbUrl: string };
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  try {
    await expect
      .poll(async () => (await c.query(
        `select item from landing_experiment_events where visitor_id = $1 and type = 'landing_exposure'`, [visitor],
      )).rows.map((r) => r.item))
      .toContain("hero-upkeep");
  } finally {
    await c.end();
  }
});

test("a DIRECT visit to /agent-computer is counted for that landing (even at 0% of the home split)", async ({ page, context }) => {
  await page.goto("/agent-computer");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/always-on computer/);
  const variant = (await context.cookies()).find((c) => c.name === COOKIE)?.value;
  expect(variant).toBe("agent-computer");
  const visitor = (await context.cookies()).find((c) => c.name === "pb_landing_visitor")!.value;
  // The exposure beacon lands in the experiment table under the agent-computer arm.
  const { Client } = await import("pg");
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const { dbUrl } = JSON.parse(readFileSync(path.join(process.cwd(), ".e2e-state.json"), "utf8")) as { dbUrl: string };
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  try {
    await expect
      .poll(async () => (await c.query(
        `select variant from landing_experiment_events where visitor_id = $1 and type = 'landing_exposure'`, [visitor],
      )).rows.map((r) => r.variant))
      .toEqual(["agent-computer"]);
  } finally {
    await c.end();
  }
});
