import { describe, it, expect, vi, beforeEach } from "vitest";

/** /admin/reports status changes are admin-only at RUNTIME: a non-admin is refused before any write. */
const requireAdmin = vi.fn<() => Promise<{ id: string }>>();
const setStatus = vi.fn<(fp: string, s: string) => Promise<void>>();
const listAll = vi.fn<() => Promise<unknown[]>>();

vi.mock("@/lib/access", () => ({ requireAdmin: () => requireAdmin() }));
vi.mock("@/lib/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/pod-service", () => ({ getPodService: vi.fn() }));
vi.mock("@podway/db", () => ({ createAppDb: () => ({}) }));
vi.mock("@podway/control-plane", () => ({
  PodReports: class {
    setStatus = setStatus;
    listAll = listAll;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { adminSetReportStatus, adminListReports } = await import("@/lib/report-actions");

describe("bug-report admin actions refuse non-admins", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a non-admin cannot change a report's status, and nothing is written", async () => {
    requireAdmin.mockRejectedValue(new Error("not admin"));
    await expect(adminSetReportStatus("fp1", "fixed")).rejects.toThrow("not admin");
    await expect(adminListReports()).rejects.toThrow("not admin");
    expect(setStatus).not.toHaveBeenCalled();
    expect(listAll).not.toHaveBeenCalled();
  });

  it("an admin gets through", async () => {
    requireAdmin.mockResolvedValue({ id: "a1" });
    await adminSetReportStatus("fp1", "fixed");
    expect(setStatus).toHaveBeenCalledWith("fp1", "fixed");
  });
});
