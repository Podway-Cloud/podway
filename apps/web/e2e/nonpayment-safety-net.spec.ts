import { test, expect } from "@playwright/test";
import { login, launchPod } from "./helpers";

/**
 * The non-payment safety net end to end. The real detector is a daily gateway sweep on a 7-day
 * clock, which a browser test can't trigger or fast-forward, so this drives the owner-scoped
 * `/api/e2e/dunning` seam (test-login gated) with an injectable clock. Uses the dedicated `billing`
 * user — the flow suspends ALL of its owner's pods, so it must not share an account with other specs.
 *
 * Flow: a running pod on a no-card, no-credit account → sweep opens a grace row → dashboard warns →
 * cross the grace boundary → the pod is suspended and the banner says so → grant credit → resolve,
 * resume, banner clears.
 */
test.describe("non-payment safety net", () => {
  test("banner → suspend after grace → resume on payment", async ({ page }) => {
    await login(page, "billing");
    await launchPod(page); // a running pod; this account has no card and no credit

    const sweep = async (body: Record<string, number>) => {
      const res = await page.request.post("/api/e2e/dunning", { data: body });
      expect(res.ok()).toBeTruthy();
      return res.json();
    };
    const bannerText = /Your pods are suspended for non-payment\.|Payment is overdue/;

    // No delinquency row yet → no banner.
    await page.goto("/dashboard");
    await expect(page.getByText(bannerText)).toHaveCount(0);

    // Sweep at day 1: no card + no credit + a billable pod → a grace row opens.
    const opened = await sweep({ offsetDays: 0 });
    expect(opened.result.opened).toBe(1);
    expect(opened.delinquency).not.toBeNull();

    // The dashboard now warns, with a Fix-billing link.
    await page.goto("/dashboard");
    await expect(page.getByText(/Payment is overdue/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Fix billing" })).toBeVisible();

    // Move past the 7-day grace → the account's pod is suspended.
    const suspended = await sweep({ offsetDays: 8 });
    expect(suspended.result.suspended).toBe(1);
    expect(suspended.delinquency.suspendedAt).not.toBeNull();

    await page.goto("/dashboard");
    await expect(page.getByText("Your pods are suspended for non-payment.")).toBeVisible();

    // Grant enough credit to cover the bill → resolve + resume, and the banner clears.
    const resolved = await sweep({ setCreditCents: 100000, offsetDays: 8 });
    expect(resolved.result.resolved).toBe(1);
    expect(resolved.delinquency).toBeNull();

    await page.goto("/dashboard");
    await expect(page.getByText(bannerText)).toHaveCount(0);
  });
});
