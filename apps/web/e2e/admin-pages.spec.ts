import { test, expect } from "@playwright/test";
import { login, launchPod } from "./helpers";

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

  test("Incidents page renders its fleet view", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/incidents");
    await expect(page.getByRole("heading", { name: "Incidents" })).toBeVisible();
  });

  test("Boxes shows host vitals and the pod-fit visualisation", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/boxes");
    await expect(page.getByText("How pods fit")).toBeVisible();
    // The fake box reports a name; the overcommit view names its axes.
    await expect(page.getByText(/Overcommit/i).first()).toBeVisible();
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

  test("Experiments admin renders and opens a detail page", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/experiments");
    // Anchor on the page's own h1 (the panel always renders it, or the route 404s), waited generously
    // because this admin route cold-compiles on first hit under CI/shard load.
    await expect(page.getByRole("heading", { name: "Landing experiments" })).toBeVisible({ timeout: 20_000 });
    // Open a specific experiment's detail via an href-based link, NOT a label. The old test looked for
    // an "Open experiment" link; #290 renamed those links ("Edit" / "start a new experiment") and
    // silently broke it — matching on the href instead survives a future rename. (The sidebar nav's
    // "/admin/experiments" has no trailing segment, so it isn't matched.)
    const detail = page.locator('a[href^="/admin/experiments/"]').first();
    await expect(detail).toBeVisible({ timeout: 20_000 });
    await detail.click();
    await expect(page).toHaveURL(/\/admin\/experiments\/.+/, { timeout: 20_000 });
    // The detail's controls card renders. Its title is control-type dependent ("Visibility" for a
    // homepage-promotion experiment, "Runtime and controls" otherwise), so match either.
    await expect(page.getByText(/Runtime and controls|Visibility/i).first()).toBeVisible({ timeout: 20_000 });
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
    await expect(page).toHaveURL(/\/admin\/pods\?sort=size/);
  });
});
