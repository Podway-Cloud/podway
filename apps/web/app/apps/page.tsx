import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppsMarketingShell, { appLogoSrc } from "@/components/apps-marketing-shell";
import { appPriceUsd, listPublicApps } from "@/lib/app-catalog";
import { APP_PAGE_COPY } from "@/lib/app-pages-copy";
import { editionOss, getCurrentUser } from "@/lib/session";
import styles from "@/app/selfhost/selfhost-landing.module.css";
import AppsSearchGrid from "@/components/apps-search-grid";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open-source app hosting with an AI admin",
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
        <AppsSearchGrid
          apps={apps.map((a) => ({
            name: a.name,
            title: a.title,
            logo: appLogoSrc(a),
            priceUsd: appPriceUsd(a),
            free: a.minSize === "mini",
            oneLiner: APP_PAGE_COPY[a.name]?.oneLiner ?? a.description,
            replaces: APP_PAGE_COPY[a.name]?.replaces ?? "",
          }))}
        />
      </section>
    </AppsMarketingShell>
  );
}
