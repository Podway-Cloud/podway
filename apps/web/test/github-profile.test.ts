import { describe, it, expect, vi, afterEach } from "vitest";
import { githubProfile, githubLooksThin } from "../lib/github-profile";

const DAY = 86_400_000;
afterEach(() => vi.unstubAllGlobals());

describe("GitHub profile signal (admin users)", () => {
  it("flags a new or empty account as thin", () => {
    const now = Date.parse("2026-10-08T00:00:00Z");
    expect(githubLooksThin({ login: "a", createdAt: new Date(now - 10 * DAY).toISOString(), publicRepos: 5 }, now)).toBe(true);
    expect(githubLooksThin({ login: "a", createdAt: new Date(now - 900 * DAY).toISOString(), publicRepos: 0 }, now)).toBe(true);
    expect(githubLooksThin({ login: "a", createdAt: new Date(now - 900 * DAY).toISOString(), publicRepos: 12 }, now)).toBe(false);
  });

  it("maps the API, caches for a day, and fails soft to null", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ login: "octo", created_at: "2020-01-01T00:00:00Z", public_repos: 8 })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await githubProfile("101", 1000)).toEqual({ login: "octo", createdAt: "2020-01-01T00:00:00Z", publicRepos: 8 });
    await githubProfile("101", 2000); // cached
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    expect(await githubProfile("202", 1000)).toBeNull();
  });
});
