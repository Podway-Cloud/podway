import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * agent-auth-state 3.3: minting a setup-token must NOT turn T3 on by itself. The t3tt owner switched T3
 * off, renewed Claude, and the plain renewal silently started a T3 enable again. Only the renew-then-T3
 * wizard (which passes `enableT3`) may start it.
 */
const startT3Enable = vi.fn<(...a: unknown[]) => Promise<void>>();
const completeSetupTokenSvc = vi.fn<(...a: unknown[]) => Promise<void>>();

vi.mock("@/lib/session", () => ({ requireUser: async () => ({ id: "u1" }), editionOss: () => false }));
vi.mock("@/lib/agent-harness", () => ({ harnessEnabled: () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/pod-service", () => ({
  getPodService: () => ({
    completeSetupToken: completeSetupTokenSvc,
    getPod: async () => ({ t3Control: false }),
    startT3Enable,
  }),
  isProvisioningEnabled: () => true,
  localPreviewUrl: async () => null,
}));

const { completeSetupToken } = await import("@/lib/actions");

describe("completeSetupToken and T3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PODWAY_PREVIEW_BASE = "podway.site";
    completeSetupTokenSvc.mockResolvedValue(undefined);
    startT3Enable.mockResolvedValue(undefined);
  });

  it("a plain renewal stores the token and does NOT start a T3 enable", async () => {
    await completeSetupToken("pod-a", "code-1");
    expect(completeSetupTokenSvc).toHaveBeenCalledOnce();
    expect(startT3Enable).not.toHaveBeenCalled();
  });

  it("the renew-then-T3 wizard (enableT3) starts the enable", async () => {
    await completeSetupToken("pod-a", "code-1", { enableT3: true });
    expect(startT3Enable).toHaveBeenCalledWith("u1", "pod-a", "https://pod-a.podway.site");
  });
});
