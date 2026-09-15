import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * The admin billing surface (#4): an operator view of every user's credit, card, pods/RAM, plus
 * a per-user drill-in with invoices, the credit ledger, and a Grant-credit control. These check
 * the real pages render for an admin, the nav entry works, and a non-admin is redirected away.
 */
test.describe("admin billing", () => {
  test("overview lists users with credit/card/RAM columns", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/billing");
    await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
    // The column headers prove the table rendered without a server error.
    await expect(page.getByRole("columnheader", { name: "Credit" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Card" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "RAM" })).toBeVisible();
    // The admin's own row is present.
    await expect(page.getByText("admin@podway.test")).toBeVisible();
    // Sidebar nav carries the Billing entry.
    await expect(page.getByRole("link", { name: "Billing" })).toBeVisible();
  });

  test("drill-in renders the sections and the grant-credit control", async ({ page }) => {
    await login(page, "admin");
    await page.goto("/admin/billing");
    // Open the first user's detail page.
    await page.getByRole("link", { name: "details" }).first().click();
    await expect(page.getByText("Credit balance")).toBeVisible();
    await expect(page.getByText(/Pods \(/)).toBeVisible();
    await expect(page.getByText(/Invoices \(/)).toBeVisible();
    await expect(page.getByText(/Credit grants \(/)).toBeVisible();
    // The grant control is present (may be disabled if Stripe is off in this env — either is fine).
    await expect(page.getByRole("button", { name: /Grant credit/ })).toBeVisible();
  });

  test("a non-admin cannot reach the billing page", async ({ page }) => {
    await login(page, "approved");
    await page.goto("/admin/billing");
    // requireAdmin redirects a non-admin to /dashboard.
    await expect(page).toHaveURL(/\/dashboard(\/|$|\?)/);
    await expect(page.getByRole("heading", { name: "Billing", exact: true })).toHaveCount(0);
  });
});
