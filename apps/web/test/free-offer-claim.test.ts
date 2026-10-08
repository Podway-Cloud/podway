import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Free-pod offer claim: set-once, one offer per account, closed after each offer's own cap. Real DB. */
const dir = mkdtempSync(join(tmpdir(), "offer-"));
beforeAll(() => {
  process.env.PODWAY_DB = "pglite";
  process.env.PODWAY_PGLITE_DIR = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("claimOffer", () => {
  it("claims once per account, stops at the offer's cap, and caps each offer separately", async () => {
    const { migratePgliteDir, createAppDb, user, inArray } = await import("@podway/db");
    await migratePgliteDir(dir);
    const { claimOffer, offerCounts, accountOffer } = await import("@/lib/attribution");
    const db = createAppDb();
    await db.insert(user).values(Array.from({ length: 102 }, (_, i) => ({ id: `u${i}`, name: `u${i}`, email: `u${i}@example.com` })));
    await db
      .update(user)
      .set({ freeOffer: "selfhst-insider", freeOfferSince: new Date() })
      .where(inArray(user.id, Array.from({ length: 99 }, (_, i) => `u${i}`)));

    expect(await claimOffer("u99", "selfhst-insider")).toBe(true); // the 100th claim
    expect(await claimOffer("u99", "noted-jeremy")).toBe(false); // one offer per account
    expect(await accountOffer("u99")).toBe("selfhst-insider");
    expect(await claimOffer("u100", "selfhst-insider")).toBe(false); // cap reached
    expect(await claimOffer("u100", "noted-jeremy")).toBe(true); // another offer has its own cap
    expect(await claimOffer("u101", "not-an-offer")).toBe(false);
    expect(await offerCounts()).toEqual({ "selfhst-insider": 100, "noted-jeremy": 1 });
  }, 60_000);
});
