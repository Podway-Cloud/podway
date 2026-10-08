import Link from "next/link";
import type { ReactNode } from "react";
import LandingAccountLink from "@/components/landing-account-link";
import type { getCurrentUser } from "@/lib/session";
import styles from "@/app/selfhost/selfhost-landing.module.css";

/** Header + footer for the public /apps and /radar pages — the self-host landing's look, reused. */
export default function AppsMarketingShell({
  user,
  children,
}: {
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  children: ReactNode;
}) {
  return (
    <div className={styles.landing}>
      <header className={styles.wrap}>
        <div className={styles.top}>
          <Link className={styles.brand} href="/" aria-label="Podway home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.brandMark} src="/podway-mark.svg" alt="" />
            <span className={styles.wordmark}><span>pod</span>way</span>
          </Link>
          <nav className={styles.nav} aria-label="Main navigation">
            <Link href="/apps">Apps</Link>
            <Link href="/radar">Upgrade Radar</Link>
            <Link href="/selfhost#pricing">Pricing</Link>
            {user ? <LandingAccountLink user={user} /> : <Link href="/selfhost/signin">Sign in</Link>}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className={`${styles.wrap} ${styles.footer}`}>
        <span>© 2026 Podway · Open-source apps, hosted on Podway and managed in Claude.</span>
        <nav aria-label="Footer navigation">
          <Link href="/apps">Apps</Link>
          <Link href="/radar">Upgrade Radar</Link>
          <Link href="/selfhost">Self-host</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}

export function appLogoSrc(entry: { name: string; logo: string | null }): string {
  return `/selfhost-apps/${entry.logo ?? `${entry.name}.svg`}`;
}
