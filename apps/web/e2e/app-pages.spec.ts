import { test, expect } from "@playwright/test";

const TOKEN = "e2e-radar-token-0000000000000000000000000000";

test.describe("public app hosting pages + Upgrade Radar", () => {
  test("/apps lists the apps and each links to its hosting page", async ({ page }) => {
    await page.goto("/apps");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Open-source apps, run for you/);
    const umami = page.getByRole("link", { name: /Umami hosting/ });
    await expect(umami).toHaveAttribute("href", "/apps/umami");
    expect(await page.locator('a[href^="/apps/"]').count()).toBeGreaterThanOrEqual(27);
  });

  test("an app page has the template, price from its size, and a /start CTA; unknown apps 404", async ({ page }) => {
    await page.goto("/apps/twenty");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Run Twenty without running a server.");
    await expect(page.getByText(/From \$7\/month/).first()).toBeVisible(); // Twenty is a Small pod
    await expect(page.getByRole("link", { name: "Start Twenty on Podway" }).first()).toHaveAttribute("href", "/start?app=twenty&ref=page-twenty");
    expect((await page.goto("/apps/not-an-app"))?.status()).toBe(404);
  });

  test("a radar feed posted to the ingest shows on /radar and on the app's page", async ({ page, request }) => {
    const feed = {
      updated: "2026-10-07", apps_watched: 27, window_days: 30,
      items: [{
        app: "Umami", slug: "umami", repo: "umami-software/umami",
        issue_url: "https://github.com/umami-software/umami/issues/4458", issue_number: 4458,
        title: "3.3.0 update will not start", what_broke: "E2E: 3.3.0 update will not start",
        opened: "2026-10-05", state: "open", from_version: "3.2.0", to_version: "3.3.0",
      }],
    };
    expect((await request.post("/api/radar/ingest", { data: feed })).status()).toBe(401); // no token
    const ok = await request.post("/api/radar/ingest", { data: feed, headers: { authorization: `Bearer ${TOKEN}` } });
    expect(ok.status()).toBe(200);

    await page.goto("/radar");
    const group = page.locator("#umami");
    await expect(group).toContainText("E2E: 3.3.0 update will not start");
    await expect(group.getByRole("link", { name: /Run Umami on Podway/ })).toHaveAttribute("href", "/start?app=umami&ref=radar-umami");

    await page.goto("/apps/umami");
    await expect(page.getByTestId("app-radar")).toContainText("E2E: 3.3.0 update will not start");
  });
});
