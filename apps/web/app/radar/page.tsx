import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppsMarketingShell from "@/components/apps-marketing-shell";
import { listPublicApps } from "@/lib/app-catalog";
import { latestRadarFeed, type RadarItem } from "@/lib/radar";
import { editionOss, getCurrentUser } from "@/lib/session";
import styles from "@/app/selfhost/selfhost-landing.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Upgrade Radar — fresh upgrade breaks across self-hosted apps · Podway",
  description:
    "Fresh upgrade breaks across popular self-hosted apps, from public GitHub issues. Updated daily.",
  alternates: { canonical: "https://podway.io/radar" },
};

/** Upgrade Radar (GTM spec, 2026-10-07): the GTM pod's daily feed, grouped by app (most breaks first).
 * Public GitHub data only. One anchor per app (#<slug>) for the /apps/<slug> pages to link to. */
export default async function RadarPage() {
  if (editionOss()) notFound();
  const [feed, user, apps] = await Promise.all([latestRadarFeed(), getCurrentUser(), listPublicApps()]);
  const offered = new Set(apps.map((a) => a.name));
  const groups = new Map<string, RadarItem[]>();
  for (const it of feed?.items ?? []) groups.set(it.slug, [...(groups.get(it.slug) ?? []), it]);
  const ordered = [...groups.entries()]
    .map(([slug, items]) => ({ slug, app: items[0]!.app, items: items.sort((a, b) => b.opened.localeCompare(a.opened)) }))
    .sort((a, b) => b.items.length - a.items.length || a.app.localeCompare(b.app));
  const total = feed?.items.length ?? 0;

  return (
    <AppsMarketingShell user={user}>
      <section className={`${styles.wrap} ${styles.band}`}>
        <p className={styles.eyebrow}>Upgrade Radar{feed ? ` · updated ${feed.updated}` : ""}</p>
        <h1 className={styles.secH}>Fresh upgrade breaks across self-hosted apps.</h1>
        <p className={styles.secP}>
          {feed
            ? `${total} breaks across ${ordered.length} apps in the last ${feed.windowDays} days, from public GitHub issues. Updated daily.`
            : "The first report is on its way. Check back tomorrow."}
        </p>
      </section>
      {ordered.map((g) => (
        <section key={g.slug} id={g.slug} className={`${styles.wrap} ${styles.band} ${styles.lined}`} data-testid="radar-app">
          <h2 className={styles.secH}>{g.app} <span className={styles.fine}>· {g.items.length} {g.items.length === 1 ? "break" : "breaks"}</span></h2>
          <ul className={styles.receipts}>
            {g.items.map((b) => (
              <li key={b.issueUrl}>
                <a className={styles.receipt} href={b.issueUrl} rel="nofollow noopener" target="_blank">
                  <q>{b.whatBroke}</q>
                  <cite>
                    {b.opened} · {b.repo} #{b.issueNumber}
                    {b.fromVersion || b.toVersion ? ` · ${b.fromVersion ?? "?"} → ${b.toVersion ?? "?"}` : ""} · {b.state}
                  </cite>
                </a>
              </li>
            ))}
          </ul>
          {offered.has(g.slug) && (
            <div className={styles.cta}>
              <Link className={styles.btnPrimary} href={`/start?app=${g.slug}&ref=radar-${g.slug}`}>
                Run {g.app} on Podway — snapshot + auto-rollback
              </Link>
              <Link className={styles.btnSecondary} href={`/apps/${g.slug}`}>{g.app} hosting</Link>
            </div>
          )}
        </section>
      ))}
    </AppsMarketingShell>
  );
}
