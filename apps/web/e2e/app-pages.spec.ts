import { test, expect } from "@playwright/test";

const TOKEN = "e2e-radar-token-0000000000000000000000000000";

test.describe("public app hosting pages + Upgrade Radar", () => {
  test("/apps lists the apps and each links to its hosting page", async ({ page }) => {
    await page.goto("/apps");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Open-source apps, run for you/);
    const umami = page.getByRole("link", { name: /^Umami/ });
    await expect(umami).toHaveAttribute("href", "/apps/umami");
    await expect(page.getByText(/Umami hosting/)).toHaveCount(0); // cards name the app only (owner, 2026-10-08)
    expect(await page.locator('a[href^="/apps/"]').count()).toBeGreaterThanOrEqual(27);
  });

  test("/apps quick search filters the cards as you type", async ({ page }) => {
    await page.goto("/apps");
    const search = page.getByRole("searchbox", { name: "Search apps" });
    await search.fill("zapier");
    await expect(page.getByRole("link", { name: /^n8n/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Umami/ })).toBeHidden();
    await search.fill("pperless"); // a typo still finds it
    await expect(page.getByRole("link", { name: /^Paperless/ })).toBeVisible();
    await search.fill("zzzz");
    await expect(page.getByText(/No app matches/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await search.fill("");
    await page.screenshot({ path: "test-results/apps-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: "test-results/apps-desktop.png" });
  });

  test("/pricing is gone (redirects to the landing pricing); the landing shows the free offer, no 'alpha'", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page).toHaveURL(/\/#pricing$/);
    await page.goto("/selfhost");
    await expect(page.getByText("Your first app is free during early access. No card needed.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start free" }).first()).toBeVisible();
    await expect(page.getByText(/alpha/i)).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/landing-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: "test-results/landing-desktop.png" });
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
