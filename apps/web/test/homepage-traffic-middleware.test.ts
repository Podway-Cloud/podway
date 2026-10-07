import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomepageTraffic } from "../lib/homepage-traffic";

// The middleware reads the live traffic; stub the DB read so this tests only its routing decision.
const traffic = vi.hoisted(() => ({ value: null as HomepageTraffic | null }));
vi.mock("../lib/homepage-traffic", () => ({ getHomepageTrafficCached: async () => traffic.value }));

import { ACTIVE_LANDING_EXPERIMENT as EXP } from "../lib/landing-experiment-config";
import { middleware } from "../middleware";

const header = (r: Response, name: string) => r.headers.get(`x-middleware-request-${name}`);
afterEach(() => {
  traffic.value = null;
  vi.restoreAllMocks();
});

describe("middleware follows the admin's live traffic", () => {
  it("one landing: a new visitor sees it and gets NO variant cookie (fair split if switched back)", async () => {
    traffic.value = { mode: "one", one: "selfhost", weights: { "agent-computer": 50, selfhost: 50 }, period: 2, periodStartedAt: new Date() };
    vi.spyOn(Math, "random").mockReturnValue(0.1); // would be agent-computer under the split
    const res = await middleware(new NextRequest("https://podway.io/"));
    expect(header(res, EXP.requestHeaders.variant)).toBe("selfhost");
    expect(res.cookies.get(EXP.cookie.variant)).toBeUndefined();
  });

  it("split: a new visitor is assigned by the live weights; a returning visitor keeps their landing", async () => {
    traffic.value = { mode: "split", one: null, weights: { "agent-computer": 10, selfhost: 90 }, period: 3, periodStartedAt: new Date() };
    vi.spyOn(Math, "random").mockReturnValue(0.2); // agent-computer under 50/50, selfhost under 10/90
    const fresh = await middleware(new NextRequest("https://podway.io/"));
    expect(fresh.cookies.get(EXP.cookie.variant)?.value).toBe("selfhost");

    const returning = await middleware(
      new NextRequest("https://podway.io/", { headers: { cookie: `${EXP.cookie.variant}=agent-computer` } }),
    );
    expect(header(returning, EXP.requestHeaders.variant)).toBe("agent-computer");
    expect(returning.cookies.get(EXP.cookie.variant)).toBeUndefined();
  });

  it("falls back to the coded split when the live traffic cannot be read", async () => {
    traffic.value = null;
    vi.spyOn(Math, "random").mockReturnValue(0.2);
    const res = await middleware(new NextRequest("https://podway.io/"));
    expect(res.cookies.get(EXP.cookie.variant)?.value).toBe("agent-computer");
  });
});
