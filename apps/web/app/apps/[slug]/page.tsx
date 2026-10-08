import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AppsMarketingShell from "@/components/apps-marketing-shell";
import { appPriceUsd, listPublicApps } from "@/lib/app-catalog";
import { APP_PAGE_COPY } from "@/lib/app-pages-copy";
import { latestRadarFeed } from "@/lib/radar";
import { SIGNUP_CREDIT_USD } from "@/lib/pricing-catalog";
import { editionOss, getCurrentUser } from "@/lib/session";
import styles from "@/app/selfhost/selfhost-landing.module.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function findApp(slug: string) {
  const app = (await listPublicApps()).find((a) => a.name === slug);
  const copy = APP_PAGE_COPY[slug];
  return app && copy ? { app, copy, price: appPriceUsd(app) } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findApp((await params).slug);
  if (!found) return {};
  const { app, copy, price } = found;
  return {
    title: `${app.title} hosting with an AI admin — $${price}/mo`,
    description: `${copy.oneLiner} Podway hosts ${app.title} 24/7 in its own pod, with a snapshot before every upgrade and automatic rollback.`,
    alternates: { canonical: `https://podway.io/apps/${app.name}` },
  };
}

/** "<App> hosting" page (GTM template, 2026-10-07). Claims are ONLY the approved shared facts. */
export default async function AppHostingPage({ params }: Props) {
  if (editionOss()) notFound();
  const { slug } = await params;
  const [found, user, radar, all] = await Promise.all([findApp(slug), getCurrentUser(), latestRadarFeed(), listPublicApps()]);
  if (!found) notFound();
  const { app, copy, price } = found;
  const start = `/start?app=${app.name}&ref=page-${app.name}`;
  const breaks = (radar?.items ?? []).filter((i) => i.slug === app.name).sort((a, b) => b.opened.localeCompare(a.opened)).slice(0, 3);
  // "Also on Podway": the next 3 apps A–Z after this one (wrapping) — spreads internal links evenly.
  const idx = all.findIndex((a) => a.name === app.name);
  const others = [1, 2, 3].map((k) => all[(idx + k) % all.length]!).filter((a) => a.name !== app.name);
  const faqs = [
    { q: `Can I bring my existing ${app.title} data?`, a: "Yes. During early access we help you move it by hand — ask us when you sign up." },
    { q: "Who does the upgrades?", a: "Your AI admin, with a snapshot first and an automatic rollback if the new version fails its health check." },
    { q: "What does it cost?", a: `From $${price}/month for ${app.title}. No per-seat fees.` },
    { q: "Is my data mine?", a: "Yes. Your own pod, your own database. Export any time." },
    { q: "Do I need to know Docker?", a: "No. You talk to your admin in Claude; it does the server work." },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: `${app.title} hosting on Podway`,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `https://podway.io/apps/${app.name}`,
        description: copy.oneLiner,
        offers: { "@type": "Offer", price: String(price), priceCurrency: "USD" },
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <AppsMarketingShell user={user}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <section className={`${styles.wrap} ${styles.band}`}>
        <p className={styles.eyebrow}>{app.title} hosting</p>
        <h1 className={styles.secH}>Run {app.title} without running a server.</h1>
        <p className={styles.secP}>
          {copy.oneLiner} Podway hosts {app.title} 24/7 in its own pod. Your AI admin sets it up, keeps it updated
          and investigates problems — you steer it from Claude.
        </p>
        <div className={styles.cta}>
          <Link className={styles.btnPrimary} href={start}>Start {app.title} on Podway</Link>
          <Link className={styles.btnSecondary} href="/apps">See all apps</Link>
        </div>
        <p className={styles.fine}>
          From <b>${price}/month</b>. ${SIGNUP_CREDIT_USD} credit when you add a card. Bring your Claude Pro or Max plan.
        </p>
      </section>

      <section className={`${styles.wrap} ${styles.band} ${styles.lined}`}>
        <h2 className={styles.secH}>Upgrades that don&rsquo;t eat your evening.</h2>
        <p className={styles.secP}>
          We take a snapshot before every upgrade. If the new version fails its health check, we roll back
          automatically, and your data comes back exactly as it was.
        </p>
      </section>

      {breaks.length > 0 && (
        <section className={`${styles.wrap} ${styles.band} ${styles.lined}`} data-testid="app-radar">
          <h2 className={styles.secH}>What breaks when people upgrade {app.title} themselves.</h2>
          <ul className={styles.receipts}>
            {breaks.map((b) => (
              <li key={b.issueUrl}>
                <a className={styles.receipt} href={b.issueUrl} rel="nofollow noopener" target="_blank">
                  <q>{b.whatBroke}</q>
                  <cite>{b.opened} · {b.repo} #{b.issueNumber} · {b.state}</cite>
                </a>
              </li>
            ))}
          </ul>
          <p className={styles.secP}>
            Real reports from people running {app.title} on their own servers. <Link href={`/radar#${app.name}`}>See the Upgrade Radar →</Link>
          </p>
        </section>
      )}

      <section className={`${styles.wrap} ${styles.band} ${styles.lined}`}>
        <h2 className={styles.secH}>Your AI admin, in Claude.</h2>
        <div className={styles.steps}>
          <div className={styles.step}><h3>Set up {app.title}</h3><p>One message, and you have a live URL in minutes.</p></div>
          <div className={styles.step}><h3>Investigate problems</h3><p>It reads the logs, explains what it finds, proposes the fix and asks before acting.</p></div>
          <div className={styles.step}><h3>Upgrade safely</h3><p>A snapshot first, then the upgrade, and an automatic rollback if the new version is unhealthy.</p></div>
        </div>
      </section>

      <section className={`${styles.wrap} ${styles.band} ${styles.lined}`}>
        <h2 className={styles.secH}>Replaces {copy.replaces}.</h2>
        <p className={styles.secP}>
          {app.title} is open source. Your data stays in your own pod, and you pay for the pod — not per seat.
        </p>
      </section>

      <section className={`${styles.wrap} ${styles.band} ${styles.lined}`} id="faq">
        <h2 className={styles.secH}>Questions.</h2>
        <dl className={styles.faq}>
          {faqs.map((f) => (
            <div key={f.q} className={styles.faqItem}>
              <dt><span className={styles.faqMark} aria-hidden="true">Q</span>{f.q}</dt>
              <dd><span className={styles.faqMark} aria-hidden="true">A</span>{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={`${styles.wrap} ${styles.final}`}>
        <h2>Start {app.title} on Podway.</h2>
        <div className={styles.cta}>
          <Link className={styles.btnPrimary} href={start}>Start {app.title} on Podway</Link>
        </div>
        {others.length > 0 && (
          <p className={styles.fine}>
            Also on Podway: {others.map((o, i) => (
              <span key={o.name}>{i > 0 && " · "}<Link href={`/apps/${o.name}`}>{o.title} hosting</Link></span>
            ))}
          </p>
        )}
      </section>
    </AppsMarketingShell>
  );
}
