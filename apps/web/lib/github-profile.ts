import "server-only";

/**
 * A GitHub sign-up's public profile signals for the admin users table (owner, 2026-10-08): account age
 * and public repos, so a brand-new or empty account stands out (an abuse signal). Looked up by the
 * numeric GitHub id better-auth stores (`account.account_id`), authenticated with our OAuth app's
 * client credentials (5000 req/h, vs 60 unauthenticated). Cached per process for a day; any failure
 * → null (the table shows "—"), never an error.
 */
export interface GithubProfile {
  login: string;
  createdAt: string;
  publicRepos: number;
}

const DAY_MS = 24 * 60 * 60_000;
const cache = new Map<string, { at: number; value: GithubProfile | null }>();

export async function githubProfile(githubId: string, now = Date.now()): Promise<GithubProfile | null> {
  const hit = cache.get(githubId);
  if (hit && now - hit.at < DAY_MS) return hit.value;
  let value: GithubProfile | null = null;
  try {
    const id = process.env.GITHUB_CLIENT_ID, secret = process.env.GITHUB_CLIENT_SECRET;
    const res = await fetch(`https://api.github.com/user/${encodeURIComponent(githubId)}`, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "podway-admin",
        ...(id && secret ? { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` } : {}),
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const d = (await res.json()) as { login?: string; created_at?: string; public_repos?: number };
      if (d.login && d.created_at) value = { login: d.login, createdAt: d.created_at, publicRepos: d.public_repos ?? 0 };
    }
  } catch {
    value = null;
  }
  cache.set(githubId, { at: now, value });
  return value;
}

/** "New or empty": under 30 days old, or no public repos — worth a look. */
export function githubLooksThin(p: GithubProfile, now = Date.now()): boolean {
  return now - Date.parse(p.createdAt) < 30 * DAY_MS || p.publicRepos === 0;
}
