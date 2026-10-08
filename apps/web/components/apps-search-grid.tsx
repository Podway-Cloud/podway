"use client";

import Link from "next/link";
import { useState } from "react";
import { appMatches, type SearchableApp } from "@/lib/app-search";
import styles from "@/app/selfhost/selfhost-landing.module.css";

export interface AppCard extends SearchableApp {
  logo: string;
  priceUsd: number;
  /** A Mini app: free during early access (no card). */
  free: boolean;
}

/** The /apps card grid with a quick filter. Every card is server-rendered (SEO); typing only hides cards. */
export default function AppsSearchGrid({ apps }: { apps: AppCard[] }) {
  const [q, setQ] = useState("");
  const shown = apps.filter((a) => appMatches(a, q));
  return (
    <>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${apps.length} apps, e.g. "Zapier"`}
        aria-label="Search apps"
        className={styles.appSearch}
      />
      <div className={styles.apps}>
        {apps.map((a) => (
          <Link key={a.name} className={styles.app} href={`/apps/${a.name}`} hidden={!shown.includes(a)}>
            <span className={styles.appTop}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.appLogo} src={a.logo} alt="" width={28} height={28} />
              <span className={styles.appName}>{a.title}</span>
            </span>
            <span className={styles.benefit}>{a.oneLiner}</span>
            <span className={styles.appMeta}>
              {a.free ? <span className={styles.freeTag}>Free · early access</span> : <span>From <strong>${a.priceUsd}/mo</strong></span>}
              {a.replaces && <span>Replaces {a.replaces}</span>}
            </span>
          </Link>
        ))}
      </div>
      {shown.length === 0 && (
        <p className={styles.secP}>
          No app matches &ldquo;{q}&rdquo;. <Link href="/start?tab=apps&ref=apps-search-empty">See the full catalog →</Link>
        </p>
      )}
    </>
  );
}
