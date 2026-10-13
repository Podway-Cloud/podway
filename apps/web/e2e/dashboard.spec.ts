import { test, expect } from "@playwright/test";
import { login, launchPod, pinLandingArm } from "./helpers";

test.describe("dashboard shell + cards", () => {
  test("create-a-pod page shows the marketplace gallery", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/dashboard/create");
    await expect(page.locator('[data-testid=env-gallery]')).toBeVisible();
    // Workspaces is the default tab, so a workspace launch is visible up front.
    await expect(page.getByRole("tab", { name: "Workspaces" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The whole card is the launch target now (no button); its overlay link is aria-labelled "Launch <title>".
    await expect(page.getByRole("link", { name: /^Launch / }).first()).toBeVisible();
    // Playbooks are hidden for now — only Workspaces + Apps show.
    await expect(page.getByRole("tab", { name: "Playbooks" })).toHaveCount(0);
    // Switching to Apps reveals an app launch.
    await page.getByRole("tab", { name: "Apps" }).click();
    await expect(page.getByRole("link", { name: /^Launch / }).first()).toBeVisible();
  });

  test("clicking an app's NAME launches it; only the arrow opens the app's site", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/dashboard/create");
    await page.getByRole("tab", { name: "Apps" }).click();
    const card = page.locator("div.group", { has: page.getByRole("link", { name: /website$/ }) }).first();
    await expect(card.getByRole("link", { name: /website$/ })).toHaveAttribute("target", "_blank");
    // A real click on the name's first letters (the launch overlay is meant to sit on top of it).
    const box = (await card.locator("h3").boundingBox())!;
    await page.mouse.click(box.x + 4, box.y + 8);
    await expect(page).toHaveURL(/\/dashboard\/pods\/new\?env=/);
  });

  test("pods page links launching to the create-a-pod page (no env cards mixed in)", async ({
    page,
  }) => {
    await login(page, "approved");
    await page.goto("/dashboard");
    // No launch tiles on the pods page — launching goes to /dashboard/create.
    await expect(page.locator('[data-testid=env-gallery]')).toHaveCount(0);
    // The content area (not just the sidebar) offers a launch entry to the create page.
    await expect(
      page.locator('main a[href="/dashboard/create"]').first(),
    ).toBeVisible();
  });

  test("legacy /new redirects to the create-a-pod page", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/new");
    await expect(page).toHaveURL(/\/dashboard\/create/);
  });

  test("legacy /dashboard/environments redirects to /dashboard/create", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/dashboard/environments");
    await expect(page).toHaveURL(/\/dashboard\/create/);
  });

  test("sidebar user menu holds saved logins + sign out", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/dashboard");
    await page.getByTestId('user-menu').click();
    await expect(page.getByRole("menuitem", { name: /sign out/i })).toBeVisible();
  });

  test("rename a pod on the cockpit persists across reload and shows on the card", async ({ page }) => {
    await login(page, "approved");
    const slug = await launchPod(page);
    await page.goto(`/dashboard/pods/${slug}`);
    await page.locator('[data-testid=cockpit-name]').click();
    const input = page.locator('[data-testid=cockpit-rename]');
    await input.fill("renamed by e2e");
    // Wait for the rename request in this ordinary reload case. Match its payload
    // because agent-card polls can also POST to the same cockpit URL.
    const committed = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" && (r.request().postData() ?? "").includes("renamed by e2e"),
    );
    await input.press("Enter");
    await expect(page.locator('[data-testid=cockpit-name]')).toContainText("renamed by e2e"); // optimistic
    await committed;

    await page.goto("/dashboard");
    await expect(page.locator('[data-testid=pod-card]', { hasText: "renamed by e2e" })).toBeVisible();

    await page.goto(`/dashboard/pods/${slug}`);
    await expect(page.locator('[data-testid=cockpit-name]')).toContainText("renamed by e2e"); // survives reload
  });

  test("rename survives leaving the cockpit before the save responds", async ({ page }) => {
    await login(page, "approved");
    const slug = await launchPod(page);
    await page.goto(`/dashboard/pods/${slug}`);
    await page.locator('[data-testid=cockpit-name]').click();
    const nextName = "renamed then left";
    await page.locator('[data-testid=cockpit-rename]').fill(nextName);

    // A slow response must not turn a visible optimistic name into an unsaved rename
    // when the owner goes straight back to their pod list.
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && (route.request().postData() ?? "").includes(nextName)) {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      await route.continue();
    });
    await page.locator('[data-testid=cockpit-rename]').press("Enter");
    await page.goto("/dashboard");
    await expect.poll(async () => {
      await page.reload();
      return page.locator('[data-testid=pod-card]', { hasText: nextName }).count();
    }, { timeout: 20_000 }).toBe(1);
    await expect(page.locator('[data-testid=pod-card]', { hasText: nextName })).toBeVisible();
  });

  test("rename endpoint rejects a form-compatible content type", async ({ page }) => {
    await login(page, "approved");
    const slug = await launchPod(page);
    const response = await page.request.post(`/api/pods/${slug}/name`, {
      data: JSON.stringify({ name: "cross-site rename" }),
      headers: { "content-type": "text/plain" },
    });
    expect(response.status()).toBe(415);
    await page.goto(`/dashboard/pods/${slug}`);
    await expect(page.locator('[data-testid=cockpit-name]')).not.toContainText("cross-site rename");
  });

  test("card shows a live status dot and links to the cockpit", async ({ page }) => {
    await login(page, "approved");
    await launchPod(page);
    await page.goto("/dashboard");
    // The card shows the pod's NAME ("e2e-pod"), not the raw slug.
    const card = page.locator('[data-testid=pod-card]').filter({ hasText: "e2e-pod" }).first();
    await expect(card.getByTestId("pod-status")).toBeVisible();
    await card.click({ position: { x: 40, y: 20 } });
    // The card links to a real pod cockpit (a slug URL, not /new).
    await expect(page).toHaveURL(/\/dashboard\/pods\/[^/]+$/);
  });
});

test.describe("dashboard on mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no horizontal overflow; sidebar collapses to a burger drawer", async ({ page }) => {
    await login(page, "approved");
    await launchPod(page);
    await page.goto("/dashboard");

    const burger = page.getByRole("button", { name: /^menu$/i });
    await expect(burger).toBeVisible();

    // The page must not scroll horizontally on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Drawer opens and nav is reachable.
    await burger.click();
    await expect(page.locator('[data-testid=sidebar][data-drawer=open]')).toBeVisible();
    await expect(page.getByTestId('nav-link').filter({ hasText: 'Create a pod' })).toBeVisible();
  });

  test("tapping a pod card opens its cockpit on mobile", async ({ page }) => {
    await login(page, "approved");
    await launchPod(page);
    await page.goto("/dashboard");
    await page.locator('[data-testid=pod-card]').filter({ hasText: "e2e-pod" }).first().click({ position: { x: 40, y: 20 } });
    await expect(page).toHaveURL(/\/dashboard\/pods\/[^/]+$/);
  });
});

test.describe("landing page, signed in", () => {
  test("shows the user's avatar beside Dashboard without growing the nav row", async ({ page, browser, baseURL }) => {
    // login() signs in through the real auth API using the PAGE's request context,
    // and it rejects the call once the page has navigated to an origin
    // ("MISSING_OR_NULL_ORIGIN"). So sign in first, and take the signed-out
    // baseline from a separate clean context rather than reordering this.
    await login(page, "approved");
    await pinLandingArm(page.context(), baseURL!, "agent-computer"); // asserts that page's nav
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: /primary/i });
    const dash = nav.getByRole("link", { name: /Dashboard/ });
    await expect(dash).toBeVisible({ timeout: 20_000 });

    // The mark sits INSIDE the link: the account and the way back to it are one
    // target, not two things that happen to be adjacent.
    await expect(dash.locator("img, span").first()).toBeVisible();

    // "Did the row grow?" needs a real BEFORE, not a pixel threshold I picked — an
    // arbitrary bound is how a layout test passes while the layout is visibly wrong.
    // The avatar is taller than the text and deliberately overflows its row via a
    // negative margin; what must not change is the header row's height.
    const signedOut = await browser.newContext({ baseURL: new URL(page.url()).origin });
    await pinLandingArm(signedOut, baseURL!, "agent-computer");
    const anon = await signedOut.newPage();
    await anon.goto("/");
    const navOut = anon.getByRole("navigation", { name: /primary/i });
    await expect(navOut.getByRole("link", { name: "Sign in" })).toBeVisible({ timeout: 20_000 });
    const before = (await navOut.boundingBox())!.height;
    await signedOut.close();

    expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(before);

    // …and it must be vertically centred with its siblings, not shifted.
    const sibling = nav.getByRole("link", { name: /Why Podway/ }).first();
    const [a, b] = [(await dash.boundingBox())!, (await sibling.boundingBox())!];
    expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(2);
  });
});
