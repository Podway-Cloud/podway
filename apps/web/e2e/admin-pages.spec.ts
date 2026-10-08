import { test, expect } from "@playwright/test";
import { login, launchPod, seedReport } from "./helpers";

/**
 * The admin backoffice sub-pages. Each is read-mostly, and none had e2e coverage —
 * so this asserts each renders for an admin, states its boundary where it has one, and
 * exposes its key controls. Denial for non-admins is covered in admin.spec.ts /
 * access.spec.ts; here we prove the pages themselves work.
 */
test.describe("admin backoffice pages", () => {
  test("Users console lists users and offers approve/revoke", async ({ page, browser }) => {
    // Seed an approved non-admin so there's a revocable row, independent of run order.
    const ctx = await browser.newContext();
    await login(await ctx.newPage(), "approved");
    await ctx.close();

    await login(page, "admin");
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(page.getByText("approved@podway.test")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Revoke$/ }).first()).toBeVisible();
  });

  test("a user row opens that user's page: ref, free pod, and their pods table", async ({ page, browser }) => {
    // The approved user claims a partner offer through its link and launches a pod.
    const ctx = await browser.newContext();
    const up = await ctx.newPage();
    await login(up, "approved");
    await up.goto("/start?ref=noted-jeremy");
    await launchPod(up);
    await ctx.close();

    await login(page, "admin");
    await page.goto("/admin/users");
    await expect(page.getByRole("columnheader", { name: "Free pod" })).toBeVisible();
    await page.getByRole("link", { name: /approved@podway\.test/ }).click();
    await expect(page).toHaveURL(/\/admin\/users\/[^/]+$/);
    await expect(page.getByText("Came from (ref)")).toBeVisible();
    await expect(page.getByText("Free pod · Noted.lol partner", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pods" })).toBeVisible();
    await expect(page.getByRole("link", { name: /e2e-pod/ }).first()).toBeVisible(); // the shared pods table
    await page.screenshot({ path: "test-results/admin-user-page.png", fullPage: true });
    await page.goto("/admin/users");
    await page.screenshot({ path: "test-results/admin-users.png", fullPage: true });
  });

  test("Incidents page renders its fleet view", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/incidents");
    await expect(page.getByRole("heading", { name: "Incidents" })).toBeVisible();
  });

  test("Boxes shows host vitals and the pod-fit visualisation", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/boxes");
    // Capacity in GB (no slots): free RAM, RAM sold, the projection, and a pods table that links each
    // pod to its admin page.
    await expect(page.getByText("Free RAM")).toBeVisible();
    await expect(page.getByText("Sold", { exact: true })).toBeVisible();
    await expect(page.getByText(/slot/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "saas-app-1" })).toHaveAttribute("href", "/admin/pods/saas-app-1");
    await expect(page.getByRole("cell", { name: "8.8 / 16 GB" })).toBeVisible(); // XL at 55%
  });

  test("Bug reports: triage a report without touching the database", async ({ page }) => {
    await seedReport("e2efp000000000000000001", "podway msg send accepted a too-long message", "cli", 3);
    await login(page, "admin");
    await page.goto("/admin/reports");
    const row = page.locator("li", { hasText: "podway msg send accepted a too-long message" });
    await expect(row).toContainText("×3");
    await expect(row).toContainText("open");
    await row.getByRole("button", { name: /^Mark fixed$/ }).click();
    await expect(row.getByRole("button", { name: /^Reopen$/ })).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("fixed");
    await row.getByRole("button", { name: /^Reopen$/ }).click();
    await expect(row.getByRole("button", { name: /^Mark fixed$/ })).toBeVisible({ timeout: 15_000 });
  });

  test("Images shows the pod-base image history", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/images");
    await expect(page.getByText("Pod-base images")).toBeVisible();
  });

  test("Skills registry renders", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/skills");
    await expect(page.getByRole("heading", { name: "Skills" }).first()).toBeVisible();
  });

  test("Relay fleet view renders its summary and empty state", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/relay");
    await expect(page.getByText("Relays").first()).toBeVisible();
    // The summary strip labels; with no relay connected the table says so.
    await expect(page.getByText("Connected").first()).toBeVisible();
    await expect(page.getByText(/No relays connected/i)).toBeVisible();
  });

  test("Homepage traffic: an admin changes the split and a NEW visitor follows it", async ({ page, browser }) => {
    await login(page, "admin");
    await page.goto("/admin/experiments");
    await expect(page.getByRole("heading", { name: "Homepage landing" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("traffic-live")).toContainText("Split test");

    // A SPLIT change (not "one landing"): visitors who already have an arm cookie — e.g. the
    // landing-ab spec running in parallel — keep their landing, so this cannot disturb them.
    const save = page.getByRole("button", { name: /save change/i });
    const apply = async (pct: string) => {
      // Real input, retried until hydrated: End = 100% on the slider; the "50 / 50" preset otherwise.
      await expect(async () => {
        if (pct === "100") await page.getByTestId("traffic-slider").press("End");
        else await page.getByRole("button", { name: `${100 - Number(pct)} / ${pct}` }).click();
        await expect(save).toBeEnabled({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });
      await save.click();
      await page.getByRole("alertdialog").getByRole("button", { name: /apply now/i }).click();
      await expect(page.getByTestId("traffic-live")).toContainText(`${100 - Number(pct)}% Agent computer · ${pct}% Self-host`, { timeout: 15_000 });
    };
    await apply("100");
    await expect(page.getByTestId("traffic-log")).toContainText("Split 0% Agent computer · 100% Self-host");

    // The middleware caches the split for ≤15s, so a fresh visitor may need one more try.
    await expect(async () => {
      const visitor = await browser.newContext();
      try {
        const v = await visitor.newPage();
        await v.goto("/");
        await expect(v.getByRole("heading", { level: 1 })).toHaveText(/Self-host anything/, { timeout: 5_000 });
      } finally {
        await visitor.close();
      }
    }).toPass({ timeout: 40_000 });

    await apply("50"); // restore the default split for the rest of the suite
  });

  test("Fetch memory states its boundary and empty state", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/fetch-memory");
    await expect(page.getByText(/never URLs, never page content, never who asked/i)).toBeVisible();
  });
});

/**
 * The admin pods table + drill-in image controls that suspend/resume + doctor tests
 * don't touch: the table's sort, and that the drill-in renders the update/rollback lever.
 */
test.describe("admin pods table + drill-in", () => {
  test("pods table renders launched pods and is sortable", async ({ page }) => {
    await login(page, "admin");
    const slug = await launchPod(page);
    await page.goto("/admin/pods");
    await expect(page.getByRole("cell", { name: new RegExp(slug) }).first()).toBeVisible();
    // The sortable headers are LINKS (th > Link href="/admin/pods?sort=…"), not buttons, and
    // "Created" is not a column — the old test targeted a non-existent button behind an
    // `if (await …count())` guard, so it passed having tested nothing. Click a real header and
    // assert the server-side sort actually applied. No guard: a missing header must FAIL.
    const sizeHeader = page.getByRole("link", { name: /Size/ }).first();
    await expect(sizeHeader).toBeVisible();
    await sizeHeader.click();
    // 20s like the phone test: the dev server re-renders the table (fleet + box + manifest reads) on the
    // sorted URL, and 5s flaked on a cold route.
    await expect(page).toHaveURL(/\/admin\/pods\?sort=size/, { timeout: 20_000 });
  });
});
