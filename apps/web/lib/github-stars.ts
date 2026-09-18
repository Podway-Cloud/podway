// Fetch a repo's GitHub metadata (star count + last-push date) for the catalog cards. Server-only
// (called from the RSC gallery). Cached for 6h via Next's fetch revalidate — this data moves slowly,
// and it keeps us far under GitHub's unauthenticated rate limit (60/hr) even with several apps. Fails
// soft (nulls) on any error so a card still renders without the meta.

export interface RepoMeta {
  stars: number | null;
  /** ISO date of the last push (repo `pushed_at`) — the "actively maintained" signal. */
  updatedAt: string | null;
}

/** Parse "https://github.com/owner/repo" → { owner, repo }, or null if it isn't a GitHub repo URL. */
function parseRepo(sourceUrl: string): { owner: string; repo: string } | null {
  const m = sourceUrl.match(/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export async function fetchRepoMeta(sourceUrl: string | null): Promise<RepoMeta> {
  const empty: RepoMeta = { stars: null, updatedAt: null };
  if (!sourceUrl) return empty;
  // Skip the external call under test/e2e (PODWAY_TEST_LOGIN): deterministic, and it avoids GitHub
  // rate-limiting hanging the /dashboard/create SSR across parallel Playwright workers.
  if (process.env.PODWAY_TEST_LOGIN === "1") return empty;
  const parsed = parseRepo(sourceUrl);
  if (!parsed) return empty;
  try {
    // Hard timeout so a slow/rate-limited GitHub can NEVER block server rendering of the catalog.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    let res: Response;
    try {
      res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "podway-catalog" },
        signal: controller.signal,
        next: { revalidate: 21600 }, // 6h
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return empty;
    const data = (await res.json()) as { stargazers_count?: unknown; pushed_at?: unknown };
    return {
      stars: typeof data.stargazers_count === "number" ? data.stargazers_count : null,
      updatedAt: typeof data.pushed_at === "string" ? data.pushed_at : null,
    };
  } catch {
    return empty;
  }
}

// formatStars / formatUpdated live in @/lib/catalog-tags (client-safe, shared with the card).
