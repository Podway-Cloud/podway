import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Open sign-up (cloud) must SAVE the new account as approved. better-auth silently drops fields it
 * does not know (`approved`) from a create hook — Frank landed in the queue on 2026-10-07 that way. */
const dir = mkdtempSync(join(tmpdir(), "open-signup-"));
beforeAll(() => {
  process.env.PODWAY_DB = "pglite";
  process.env.PODWAY_PGLITE_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("open sign-up", () => {
  it("a new cloud account is stored approved", async () => {
    const { migratePgliteDir, createAppDb, user, eq } = await import("@podway/db");
    await migratePgliteDir(dir);
    const { createAuth } = await import("../src/index.js");
    // Cloud edition, open sign-up (no PODWAY_SIGNUP_REVIEW); test login is the only sign-up path a test can drive.
    const auth = createAuth({ DATABASE_URL: "unused", BETTER_AUTH_SECRET: "s".repeat(40), PODWAY_TEST_LOGIN: "1", BETTER_AUTH_URL: "http://localhost:3000" });
    await auth.api.signUpEmail({ body: { email: "frank@example.com", password: "a-long-password-1", name: "Frank" } });
    const [row] = await createAppDb().select().from(user).where(eq(user.email, "frank@example.com"));
    expect(row?.approved).toBe(true);
  }, 30_000); // migrating a fresh pglite DB takes >5s when the whole package suite runs in parallel
});
