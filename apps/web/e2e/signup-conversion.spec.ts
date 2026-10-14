import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { USERS } from "./users";

async function setCreatedAt(email: string, sql: string): Promise<void> {
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const { Client } = await import("pg");
  const { dbUrl } = JSON.parse(readFileSync(path.join(process.cwd(), ".e2e-state.json"), "utf8")) as { dbUrl: string };
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  try {
    await c.query(`UPDATE "user" SET created_at = ${sql} WHERE email = $1`, [email]);
  } finally {
    await c.end();
  }
}

// Google Ads sign-up conversion (owner, 2026-10-14): fires once for a minutes-old account, never for an old one.
test.describe("sign-up conversion", () => {
  test.afterAll(async () => setCreatedAt(USERS.approved.email, "now() - interval '30 days'"));

  test("a brand-new account marks the sign-up once; an old account never does", async ({ browser }) => {
    await setCreatedAt(USERS.approved.email, "now()");
    const fresh = await browser.newContext();
    const p1 = await fresh.newPage();
    await login(p1, "approved");
    await p1.goto("/dashboard");
    await expect.poll(async () => (await fresh.cookies()).some((c) => c.name === "pw_signup_sent")).toBe(true);
    await fresh.close();

    await setCreatedAt(USERS.approved.email, "now() - interval '30 days'");
    const old = await browser.newContext();
    const p2 = await old.newPage();
    await login(p2, "approved");
    await p2.goto("/dashboard");
    await expect(p2.getByRole("link", { name: "Pods" }).first()).toBeVisible();
    expect((await old.cookies()).some((c) => c.name === "pw_signup_sent")).toBe(false);
    await old.close();
  });
});
