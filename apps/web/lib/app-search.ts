/**
 * Forgiving app search for /apps: every typed word must match the app — as a substring of its name,
 * one-liner or "replaces", OR as an in-order subsequence of its title (so "nn" finds n8n and "pperless"
 * finds Paperless). No library: ~30 apps, a linear scan per keystroke is instant.
 */
export interface SearchableApp {
  title: string;
  name: string;
  oneLiner: string;
  replaces: string;
}

function subsequence(q: string, s: string): boolean {
  let i = 0;
  for (const c of s) if (c === q[i]) i++;
  return i === q.length;
}

export function appMatches(app: SearchableApp, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${app.title} ${app.name} ${app.oneLiner} ${app.replaces}`.toLowerCase();
  const title = app.title.toLowerCase();
  return words.every((w) => hay.includes(w) || subsequence(w, title));
}
