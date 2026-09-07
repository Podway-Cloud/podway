import { test, expect } from "@playwright/test";
import { login, launchPod } from "./helpers";

const SHOTS = process.env.PODWAY_UX_SHOTS ?? "/tmp/ux";

/**
 * Not a regression test — this exists to SHOW the owner what a user actually sees, because
 * "the app layer is built" is not something you can review from a diff. It drives the real
 * pages and writes screenshots.
 *
 * Run with the edge env vars SET, or every shot is an empty row (which is the point of the gate).
 */
test.describe("custom domains — what the user sees", () => {
  test("the Settings row and the wizard", async ({ page }) => {
    // SKIPPED in CI, and that is the correct behaviour, not a gap: this spec captures screenshots
    // of a feature that is GATED OFF unless the TLS edge is provisioned. CI has no edge, so the
    // row is (rightly) absent and asserting it visible would fail — which is exactly what happened
    // the first time this ran on CI. Run it with the two PODWAY_DOMAIN_* vars set.
    test.skip(
      !process.env.PODWAY_DOMAIN_CNAME_TARGET || !process.env.PODWAY_DOMAIN_ANYCAST_IP,
      "needs a provisioned edge — see docs/runbooks/custom-domains-edge.md",
    );
    await page.setViewportSize({ width: 1280, height: 1000 });
    await login(page, "approved");
    const slug = await launchPod(page);

    await page.goto(`/dashboard/pods/${slug}`);
    await page.getByRole("tab", { name: /settings/i }).click();

    const row = page.getByText("Custom domain", { exact: false }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/1-settings-row.png`, fullPage: false });

    // The row's own button — "Set up domain…" when there is no domain yet.
    const cta = page.getByRole("link", { name: /set up domain|manage/i }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${SHOTS}/2-wizard-empty.png`, fullPage: true });

    // Type a hostname and advance, so the DNS-records step is captured.
    const input = page.getByRole("textbox").first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill("app.acme.com");
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/3-wizard-typed.png`, fullPage: true });
      const submit = page.getByRole("button", { name: /add|continue|next|save/i }).first();
      if (await submit.isEnabled().catch(() => false)) {
        await submit.click();
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${SHOTS}/4-wizard-dns-records.png`, fullPage: true });
        await page.goto(`/dashboard/pods/${slug}`);
        await page.getByRole("tab", { name: /settings/i }).click();
        await page.getByText("Custom domain", { exact: false }).first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${SHOTS}/5-settings-row-verifying.png` });
      }
    }
  });

  test("with the edge UNPROVISIONED the row is absent", async ({ page }) => {
    test.skip(process.env.PODWAY_UX_UNPROVISIONED !== "1", "second pass only");
    await login(page, "approved");
    const slug = await launchPod(page);
    await page.goto(`/dashboard/pods/${slug}`);
    await page.getByRole("tab", { name: /settings/i }).click();
    await expect(page.getByRole("tab", { name: /settings/i })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByText("Custom domain", { exact: false })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/0-settings-no-domain-row.png` });
  });
});
