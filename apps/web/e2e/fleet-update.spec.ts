import { test, expect } from "@playwright/test";
import { login, launchPod, waitForPodReady } from "./helpers";

async function dbClient() {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const { Client } = await import("pg");
  const state = JSON.parse(
    readFileSync(path.join(process.cwd(), ".e2e-state.json"), "utf8"),
  ) as { dbUrl?: string };
  if (!state.dbUrl) throw new Error("e2e state has no dbUrl — is global-setup current?");
  const client = new Client({ connectionString: state.dbUrl });
  await client.connect();
  return client;
}

/** The persisted value, so a test can wait for the write rather than guess from network traffic. */
async function podAutoUpdate(slug: string): Promise<string | null> {
  const c = await dbClient();
  try {
    const r = await c.query<{ auto_update: string | null }>(
      `SELECT auto_update FROM pods WHERE id = $1`,
      [slug],
    );
    return r.rows[0]?.auto_update ?? null;
  } finally {
    await c.end();
  }
}


/**
 * Fleet-updates (Feature C): the per-pod "Auto-update" exclude toggle in pod Settings.
 *
 * Cloud-only (the fake e2e stack runs as the cloud edition). The bulk "update N idle pods" button
 * (Feature A) is NOT exercised here: it needs a real pin-vs-digest "behind" state that the fake
 * stack deliberately doesn't produce (see update.spec.ts) — its logic is unit-covered in
 * control-plane/test/fleet-update-idle.test.ts instead. This spec verifies C end-to-end: the toggle
 * renders, flips, and PERSISTS across a reload (a real DB write via setPodAutoUpdate).
 */
test.describe("pod Settings — Auto-update exclude", () => {
  test("toggles between Included and Excluded and persists", async ({ page }) => {
    await login(page, "approved");
    const slug = await launchPod(page);
    await waitForPodReady(page, slug);

    await page.goto(`/dashboard/pods/${slug}?tab=settings`);

    // Default: auto-update ON (the switch is checked), included in the bulk action.
    const toggle = page.getByRole("switch", { name: "Auto-update" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeChecked();
    await expect(page.getByText(/On — included in the .Update idle pods. bulk action/i)).toBeVisible();

    // Turn off → the switch + label flip (optimistic).
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByText(/Off — skipped by/i)).toBeVisible();

    // Wait for the WRITE, not for the network to go quiet.
    //
    // This used to be `waitForLoadState("networkidle")`, and it was unsound from the start: the
    // cockpit polls live signals continuously, so on this page "networkidle" never means "the
    // server action committed" — it resolves on whatever unrelated lull comes first. The flip above
    // is optimistic, so a reload that beat the write read the OLD value back and the test failed
    // with "expected not checked, received checked" — which reads exactly like a persistence BUG in
    // the product rather than a race in the test. It went red on CI on 2026-09-06 (passing 3/3
    // locally at the same commit) on a PR that changed only the Dockerfile.
    //
    // Poll the row instead. That is the thing the assertion below actually cares about.
    await expect.poll(() => podAutoUpdate(slug), { timeout: 15_000 }).toBe("off");

    // Durable: a reload still shows OFF (persisted to the pod row, not just local state).
    await page.reload();
    await expect(page.getByRole("switch", { name: "Auto-update" })).not.toBeChecked();
    await expect(page.getByText(/Off — skipped by/i)).toBeVisible();

    // And back ON.
    await page.getByRole("switch", { name: "Auto-update" }).click();
    await expect(page.getByText(/On — included in the .Update idle pods. bulk action/i)).toBeVisible();
  });
});
