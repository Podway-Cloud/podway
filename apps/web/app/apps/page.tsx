import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppsMarketingShell, { appLogoSrc } from "@/components/apps-marketing-shell";
import { appPriceUsd, listPublicApps } from "@/lib/app-catalog";
import { APP_PAGE_COPY } from "@/lib/app-pages-copy";
import { editionOss, getCurrentUser } from "@/lib/session";
import styles from "@/app/selfhost/selfhost-landing.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open-source app hosting with an AI admin · Podway",
  description:
    "Run n8n, Umami, Twenty, Ghost and more in your own cloud pod. A snapshot before every upgrade, automatic rollback, and an AI admin you steer from Claude. From $4/month per app.",
  alternates: { canonical: "https://podway.io/apps" },
};

/** Every app a visitor can launch, each linking to its own hosting page. Cloud only. */
export default async function AppsIndex() {
  if (editionOss()) notFound();
  const [apps, user] = await Promise.all([listPublicApps(), getCurrentUser()]);
  return (
    <AppsMarketingShell user={user}>
      <section className={`${styles.wrap} ${styles.band}`}>
        <p className={styles.eyebrow}>{apps.length} apps · hosted on Podway</p>
        <h1 className={styles.secH}>Open-source apps, run for you.</h1>
        <p className={styles.secP}>
          Each app runs 24/7 in its own cloud pod. Before every upgrade we take a snapshot, and if the new
          version fails its health check we roll back automatically. Your AI admin, in Claude, does the server work.
        </p>
        <div className={styles.apps}>
          {apps.map((a) => (
            <Link key={a.name} className={styles.app} href={`/apps/${a.name}`}>
              <span className={styles.appTop}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.appLogo} src={appLogoSrc(a)} alt="" width={28} height={28} />
                <span className={styles.appName}>{a.title} hosting</span>
              </span>
              <span className={styles.benefit}>{APP_PAGE_COPY[a.name]?.oneLiner ?? a.description}</span>
              <span className={styles.appMeta}>
                <span>From <strong>${appPriceUsd(a)}/mo</strong></span>
                {APP_PAGE_COPY[a.name] && <span>Replaces {APP_PAGE_COPY[a.name]!.replaces}</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </AppsMarketingShell>
  );
}
