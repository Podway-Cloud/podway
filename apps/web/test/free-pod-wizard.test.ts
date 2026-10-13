import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/** Free alpha Mini (owner, 2026-10-08): the wizard says "free" ONLY when billing would not charge —
 * billing on and the pod keeps the account within its free RAM budget (dunning.ts). A carded account
 * keeps its grandfathered free pod (billing.ts freePodGb), so the page passes that as freeRamGb. */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/actions", () => ({ launchPod: vi.fn() }));
vi.mock("@/components/add-card-dialog", () => ({ default: () => null }));
vi.mock("@/components/github-repo-field", () => ({ GithubRepoField: () => null }));

// The test transform uses the classic JSX runtime (React.createElement), so expose React globally.
(globalThis as { React?: unknown }).React = React;
const { default: LaunchConfigure } = await import("@/components/launch-configure");

const render = (over: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(LaunchConfigure, {
      env: "uptime-kuma", secrets: [], minSize: "mini", agentIds: ["claude-code"], enabled: true, oss: false,
      ram: { used: 0, cap: 1, unlimited: false }, billingEnabled: true, hasCard: false, freeRamGb: 1, ...over,
    } as never),
  );

describe("free alpha Mini in the launch wizard", () => {
  it("a no-card account's first Mini is offered free", () => {
    expect(render({})).toContain("Free during early access · no card needed");
  });
  it("a carded early-access account's first Mini is free too, without the no-card line", () => {
    const html = render({ hasCard: true, ram: { used: 0, cap: 64, unlimited: false } });
    expect(html).toContain("Free during early access");
    expect(html).not.toContain("no card needed");
  });
  it("never says free with a card past early access, a second pod, or billing off", () => {
    expect(render({ hasCard: true, freeRamGb: 0 })).not.toContain("Free during early access");
    expect(render({ ram: { used: 1, cap: 1, unlimited: false } })).not.toContain("Free during early access");
    expect(render({ billingEnabled: false })).not.toContain("Free during early access");
  });
  it("shows the env's size note under the size picker (Twenty on Small, 2026-10-11)", () => {
    expect(render({ sizeNote: "Twenty runs slowly on Small." })).toContain("Twenty runs slowly on Small.");
    expect(render({})).not.toContain("runs slowly");
  });
});
