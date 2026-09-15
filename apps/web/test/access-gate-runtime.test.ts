import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RUNTIME enforcement of the access gates — the complement to the source-scan/completeness tests.
 * These INVOKE `requireApprovedUser` / `requireAdmin` with a controlled principal and assert the real
 * gate logic refuses (redirects) an unauthorized caller — catching a gate that is present-but-wrong
 * (bad order, ignored result, wrong predicate), which a "source contains requireAdmin()" check cannot.
 *
 * Seam: mock only the INPUTS the gate reads — the session (`getCurrentUser`/`editionOss`), the
 * allowlist predicates, and the DB approval lookup — and let the REAL gate decide. `redirect` throws a
 * sentinel we can assert the destination of (that is how next/navigation signals a redirect).
 */
class RedirectError extends Error {
  constructor(public to: string) {
    super(`REDIRECT:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

const getCurrentUser = vi.fn();
const editionOss = vi.fn(() => false);
vi.mock("@/lib/session", () => ({
  getCurrentUser: () => getCurrentUser(),
  editionOss: () => editionOss(),
}));

const isAdmin = vi.fn((_email?: string) => false);
const isPreapproved = vi.fn((_email?: string) => false);
vi.mock("@/lib/access-rules", () => ({
  isAdmin: (e: string) => isAdmin(e),
  isPreapproved: (e: string) => isPreapproved(e),
}));

let approvedFlag = false;
vi.mock("@podway/db", () => ({
  createAppDb: () => ({
    select: () => ({ from: () => ({ where: () => Promise.resolve([{ approved: approvedFlag }]) }) }),
  }),
  user: {},
  session: {},
  pods: {},
}));

const { requireApprovedUser, requireAdmin } = await import("@/lib/access");

const USER = { id: "u1", email: "user@example.com", name: "U", emailVerified: true } as const;
const ADMIN = { id: "a1", email: "admin@podway.test", name: "A", emailVerified: true } as const;

beforeEach(() => {
  getCurrentUser.mockReset();
  editionOss.mockReturnValue(false);
  isAdmin.mockReturnValue(false);
  isPreapproved.mockReturnValue(false);
  approvedFlag = false;
});

describe("requireApprovedUser enforces at runtime", () => {
  it("redirects an unauthenticated caller to /signin", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireApprovedUser()).rejects.toMatchObject({ to: "/signin" });
  });

  it("redirects an authenticated-but-UNAPPROVED, non-admin user to /pending", async () => {
    getCurrentUser.mockResolvedValue(USER);
    approvedFlag = false;
    await expect(requireApprovedUser()).rejects.toMatchObject({ to: "/pending" });
  });

  it("lets an APPROVED user through", async () => {
    getCurrentUser.mockResolvedValue(USER);
    approvedFlag = true;
    await expect(requireApprovedUser()).resolves.toMatchObject({ id: "u1" });
  });

  it("lets an admin through even when the approved flag is false", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    isAdmin.mockReturnValue(true);
    approvedFlag = false;
    await expect(requireApprovedUser()).resolves.toMatchObject({ id: "a1" });
  });

  it("lets the single-tenant OSS owner through without an approval check", async () => {
    getCurrentUser.mockResolvedValue(USER);
    editionOss.mockReturnValue(true);
    approvedFlag = false;
    await expect(requireApprovedUser()).resolves.toMatchObject({ id: "u1" });
  });
});

describe("requireAdmin enforces at runtime", () => {
  it("redirects an unauthenticated caller to /signin", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toMatchObject({ to: "/signin" });
  });

  it("redirects a non-admin to /dashboard", async () => {
    getCurrentUser.mockResolvedValue(USER);
    isAdmin.mockReturnValue(false);
    await expect(requireAdmin()).rejects.toMatchObject({ to: "/dashboard" });
  });

  it("redirects an admin whose email is not verified to /dashboard", async () => {
    getCurrentUser.mockResolvedValue({ ...ADMIN, emailVerified: false });
    isAdmin.mockReturnValue(true);
    await expect(requireAdmin()).rejects.toMatchObject({ to: "/dashboard" });
  });

  it("lets a verified admin through", async () => {
    getCurrentUser.mockResolvedValue(ADMIN);
    isAdmin.mockReturnValue(true);
    await expect(requireAdmin()).resolves.toMatchObject({ id: "a1" });
  });
});
