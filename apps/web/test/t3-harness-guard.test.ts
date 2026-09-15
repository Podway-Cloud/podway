import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * agent-harness-toggle §3: every T3 ENABLE/connect server action must refuse when the T3 harness is
 * disabled. The four enable actions are tested at RUNTIME here — the harness check is their first line
 * (before the auth gate), so mocking `harnessEnabled` → false and invoking each proves it actually
 * returns T3_DISABLED without proceeding. `completeSetupToken` (an auto-enable inside a completion
 * flow) and `disableT3Code` (must stay UNguarded so an already-T3 pod keeps its off-switch) are nuanced
 * shapes kept as source checks.
 */
const harnessEnabled = vi.fn<(h: string) => boolean>();
vi.mock("@/lib/agent-harness", () => ({ harnessEnabled: (h: string) => harnessEnabled(h) }));

const actions = (await import("@/lib/actions")) as unknown as Record<
  string,
  (...args: unknown[]) => Promise<unknown>
>;

const T3_DISABLED = { error: "T3 Code isn't available." };

beforeEach(() => {
  harnessEnabled.mockReset();
});

describe("T3 enable actions refuse at runtime when the harness is off", () => {
  for (const name of ["enableT3Code", "startT3Connect", "submitT3ConnectCode", "regenerateT3Pairing"]) {
    it(`${name} returns T3_DISABLED and does not proceed`, async () => {
      harnessEnabled.mockReturnValue(false);
      // Harness check is the first line, so it returns before touching these args.
      const res = await actions[name]!("some-slug", "some-code");
      expect(res).toEqual(T3_DISABLED);
      expect(harnessEnabled).toHaveBeenCalledWith("t3");
    });
  }
});

// --- source checks for the two nuanced shapes -------------------------------------------------
const src = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "actions.ts"),
  "utf8",
);
const fnBody = (name: string): string => {
  const start = src.indexOf(`export async function ${name}`);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);
  const rest = src.slice(start);
  return rest.slice(0, rest.indexOf("\n}\n") + 2);
};

describe("T3 harness guard — nuanced shapes (source)", () => {
  it("completeSetupToken's auto-enable is gated on harnessEnabled", () => {
    expect(fnBody("completeSetupToken")).toContain('harnessEnabled("t3")');
  });

  it("disableT3Code is NOT guarded — an already-T3 pod keeps its off-switch", () => {
    expect(fnBody("disableT3Code")).not.toContain("harnessEnabled");
  });
});
