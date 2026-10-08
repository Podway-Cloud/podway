import { getEnvironmentDetail } from "@/lib/environments";
import { noCardRamGb, ramGbForSize } from "@podway/shared/tiers";

/** "You're setting up <App> — free during early access" when `next` is a /start?app= link whose app fits the
 * visitor's free no-card budget (a Mini app; a Small one for an email-* lead) — the same rule billing
 * uses, so the promise holds. Anything else → no line. */
export async function freeSetupNote(next: string): Promise<string | undefined> {
  const u = new URL(next, "https://podway.io");
  const app = u.searchParams.get("app");
  if (u.pathname !== "/start" || !app || !/^[a-z0-9-]+$/.test(app)) return undefined;
  const env = await getEnvironmentDetail(app).catch(() => null);
  if (!env?.minSize || ramGbForSize(env.minSize) > noCardRamGb(u.searchParams.get("ref"))) return undefined;
  return `You're setting up ${env.title} — free during early access, no card needed.`;
}
