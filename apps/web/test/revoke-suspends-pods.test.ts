import { describe, it, expect, vi, beforeEach } from "vitest";

/** Abuse response: admin Revoke must also suspend the user's RUNNING pods — and a non-admin is refused
 * before anything happens. */
const requireAdmin = vi.fn<() => Promise<{ id: string }>>();
const update = vi.fn();
const listPods = vi.fn();
const adminSleep = vi.fn();
vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/pod-service", () => ({ getPodService: () => ({ listPods, adminSleep }) }));
vi.mock("@podway/db", () => ({
  user: { id: "id" },
  createAppDb: () => ({ update: () => ({ set: () => ({ where: (...a: unknown[]) => update(...a) }) }) }),
}));
vi.mock("@podway/auth", () => ({ sendApprovalEmail: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { revokeUser } = await import("@/lib/admin-actions");

beforeEach(() => {
  [requireAdmin, update, listPods, adminSleep].forEach((f) => f.mockReset());
  listPods.mockResolvedValue([
    { id: "p1", status: "running" },
    { id: "p2", status: "suspended" },
    { id: "p3", status: "running" },
  ]);
  adminSleep.mockResolvedValue({});
});

describe("revokeUser", () => {
  it("refuses a non-admin and touches nothing", async () => {
    requireAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(revokeUser("u1")).rejects.toThrow("Forbidden");
    expect(update).not.toHaveBeenCalled();
    expect(adminSleep).not.toHaveBeenCalled();
  });

  it("revokes and suspends every running pod, even if one suspend fails", async () => {
    requireAdmin.mockResolvedValue({ id: "admin_1" });
    adminSleep.mockRejectedValueOnce(new Error("boom"));
    await revokeUser("u1");
    expect(update).toHaveBeenCalledTimes(1);
    expect(listPods).toHaveBeenCalledWith("u1");
    expect(adminSleep.mock.calls.map((c) => c[0])).toEqual(["p1", "p3"]);
  });
});
