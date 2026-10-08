import type { AdminUserDetail } from "@/lib/access";

/** Account age as one short unit: 12d, 5mo, 3y. */
function age(iso: string): string {
  const d = (Date.now() - Date.parse(iso)) / 86_400_000;
  return d < 60 ? `${Math.floor(d)}d` : d < 730 ? `${Math.floor(d / 30)}mo` : `${Math.floor(d / 365)}y`;
}

/** How a user signs in; for GitHub, the account's age + public repos, flagged when new or empty (an
 * abuse signal — owner, 2026-10-08). */
export default function AdminSigninCell({ u }: { u: Pick<AdminUserDetail, "providers" | "github"> }) {
  if (u.github) {
    const g = u.github;
    return (
      <span className={g.thin ? "text-warning" : undefined} title={g.thin ? "New (<30 days) or no public repos" : undefined}>
        <a className="hover:underline" href={`https://github.com/${g.login}`} target="_blank" rel="noopener noreferrer">
          GitHub @{g.login}
        </a>
        <span className="ml-1 text-[11px] text-muted-foreground">
          · {age(g.createdAt)} · {g.publicRepos} repo{g.publicRepos === 1 ? "" : "s"}
        </span>
      </span>
    );
  }
  const p = u.providers.map((x) => x[0]!.toUpperCase() + x.slice(1)).join(", ");
  return <span className="text-muted-foreground">{p || "—"}</span>;
}
