import { describe, it, expect, vi, beforeEach } from "vitest";

/** Runtime gate: the homepage traffic switch changes what every visitor sees, so a non-admin must be
 * refused BEFORE any write (a present-but-broken gate would pass a source scan, not this). */
const requireAdmin = vi.fn<() => Promise<{ id: string }>>();
const applyHomepageTraffic = vi.fn();
vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/homepage-traffic", () => ({ applyHomepageTraffic: (...a: unknown[]) => applyHomepageTraffic(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveHomepageTraffic } = await import("@/lib/landing-experiment-admin-actions");

beforeEach(() => {
  requireAdmin.mockReset();
  applyHomepageTraffic.mockReset();
});

describe("saveHomepageTraffic gate", () => {
  it("refuses a non-admin and writes nothing", async () => {
    requireAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(saveHomepageTraffic({ mode: "one", variant: "selfhost" })).rejects.toThrow("Forbidden");
    expect(applyHomepageTraffic).not.toHaveBeenCalled();
  });

  it("lets an admin through, attributed to them", async () => {
    requireAdmin.mockResolvedValue({ id: "admin_1" });
    await saveHomepageTraffic({ mode: "one", variant: "selfhost" });
    expect(applyHomepageTraffic).toHaveBeenCalledWith("admin_1", { mode: "one", variant: "selfhost" });
  });
});
