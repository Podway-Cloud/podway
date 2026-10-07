import Link from "next/link";
import { Check, History, MessageSquare, ShieldCheck, Wrench } from "lucide-react";
import LandingAccountLink from "@/components/landing-account-link";
import { TrackedLink } from "../landing-examples";
import type { getCurrentUser } from "@/lib/session";
import { PRICING_TIERS, SIGNUP_CREDIT_USD, SUSPENDED_USD } from "@/lib/pricing-catalog";
import { LINEUP, MAINTENANCE_REPORTS, appPriceUsd } from "./selfhost-lineup";
import SelfhostConversation from "./selfhost-conversation";
import styles from "./selfhost-landing.module.css";

// The self-hosted AI admin landing (served at /selfhost, and at / for the `selfhost` A/B arm).
// Compact by design: one idea per section, cards over prose. Every claim here is true TODAY — the
// owner ruled out aspirational copy (2026-10-06): no "watches upstream", no own-hardware mode.

const PRICING = PRICING_TIERS.filter((t) => t.id === "mini" || t.id === "s" || t.id === "m");
const PRICING_COPY: Record<string, string> = {
  mini: "One light app, such as analytics, uptime checks or a password vault.",
  s: "Heavier apps, such as n8n automations, a CRM or BI dashboards.",
  m: "A busy app with room to grow: more users, more data, more workflows.",
};
const INCLUDED = [
  "Always on, 24/7",
  "Your AI admin, in Claude",
  "Snapshot before every upgrade",
  "Automatic rollback after a failed upgrade",
  "Custom domain + automatic HTTPS",
  "Unlimited bandwidth",
];

const SUPPORT = [
  {
    icon: Wrench,
    title: "Set up your app",
    text: "Your admin handles the app's setup and helps with configuration changes you request.",
  },
  {
    icon: MessageSquare,
    title: "Investigate problems",
    text: "Ask in Claude when something breaks. Your admin can inspect the app and help fix it.",
  },
  {
    icon: ShieldCheck,
    title: "Keep secrets out of chat",
    text: "Add passwords and API keys in pod settings so your admin can use them without pasting them into a conversation.",
  },
  {
    icon: History,
    title: "Back up and roll back",
    text: "Before upgrades, it snapshots data and settings. If the new version fails its health check, it restores the previous version and data.",
  },
];

const FAQS = [
  {
    q: "Where does my app run?",
    a: "In Podway's cloud, in an always-on pod for that app. You manage it through your Podway account and your Claude conversation.",
  },
  {
    q: "What does the AI admin actually do?",
    a: "It sets up the app, takes backups, handles upgrades you request, and helps investigate problems from your Claude conversation. Risky upgrades wait for your approval.",
  },
  {
    q: "Can I use my existing Claude subscription?",
    a: "Yes. Sign in with Claude Pro or Max. Podway adds no token markup, and you can continue the same session from the Claude desktop or mobile app.",
  },
  {
    q: "Do my apps keep running when I close my laptop?",
    a: "Yes. Every pod runs 24/7 in Podway's cloud.",
  },
  {
    q: "How do I give it passwords or API keys?",
    a: "Add them in your pod's settings. The admin can use them without you pasting secrets into the chat.",
  },
  {
    q: "What if an upgrade goes wrong?",
    a: "If the upgraded app fails its health check, your admin restores the previous app version and the snapshot taken before the upgrade.",
  },
];

export default function SelfhostLanding({
  user,
}: {
  user: Awaited<ReturnType<typeof getCurrentUser>>;
}) {
  const primaryHref = "/start?tab=apps&ref=selfhost-landing";
  const primaryLabel = "Start hosting an app";
  const fromUsd = Math.min(...LINEUP.map(appPriceUsd));

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
            <a href="#apps">Apps</a>
            <a href="#pricing">Pricing</a>
            <Link href="/docs">Docs</Link>
            {user ? <LandingAccountLink user={user} /> : <Link href="/selfhost/signin">Sign in</Link>}
          </nav>
        </div>
      </header>

      <main>
        <section className={`${styles.wrap} ${styles.hero}`}>
          <div>
            <p className={styles.eyebrow}>open-source apps · hosted on Podway</p>
            <h1>
              Self-host anything.<br />
              <span className={styles.accent}>Your AI admin runs it.</span>
            </h1>
            <p className={styles.sub}>
              Choose an app like n8n, Ghost or Umami. Podway runs it 24/7 in a cloud pod.
              Your AI admin handles setup, backups and upgrades, helps investigate problems and steer your app.
            </p>
            <div className={styles.cta}>
              <TrackedLink className={styles.btnPrimary} href={primaryHref} eventName="landing_primary_cta" item="selfhost-hero">
                {primaryLabel}
              </TrackedLink>
              <a className={styles.btnSecondary} href="#apps">Browse apps</a>
            </div>
            <p className={styles.fine}>
              <b>Hosting from ${fromUsd}/month per app.</b> ${SIGNUP_CREDIT_USD} credit when you add a card.<br />
              Bring your Claude Pro or Max plan.
            </p>
          </div>

          <SelfhostConversation />
        </section>

        <section className={`${styles.band} ${styles.lined}`}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>the upkeep</p>
            <h2 className={styles.secH}>Open-source apps still need someone to maintain them.</h2>
            <p className={styles.secP}>A routine upgrade can break a workflow or leave an app unable to start. These are reports from people running the apps themselves.</p>
            <div className={styles.receipts}>
              {MAINTENANCE_REPORTS.map((r) => (
                <a key={r.href} className={styles.receipt} href={r.href} target="_blank" rel="noopener noreferrer">
                  <q>{r.quote}</q>
                  <cite>Source: {r.source}</cite>
                </a>
              ))}
            </div>
            <p className={styles.punch}>
              Let your AI admin handle the maintenance.
            </p>
          </div>
        </section>

        <section id="apps" className={`${styles.band} ${styles.tint}`}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>supported apps</p>
            <h2 className={styles.secH}>Pick an app to run on Podway.</h2>
            <p className={styles.secP}>
              Choose an app and get it running in minutes with your AI admin in control.
            </p>
            <div className={styles.apps}>
              {LINEUP.map((app) => (
                <TrackedLink
                  key={app.slug}
                  className={styles.app}
                  href={`/start?app=${app.slug}&ref=selfhost-lineup`}
                  eventName="landing_primary_cta"
                  item={`selfhost-app-${app.slug}`}
                >
                  <span className={styles.appTop}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={styles.appLogo} src={app.logo} alt="" width={28} height={28} />
                    <span className={styles.appName}>{app.name}</span>
                  </span>
                  <span className={styles.benefit}>{app.benefit}</span>
                  <span className={styles.appMeta}>
                    <span>From <strong>${appPriceUsd(app)}/mo</strong></span>
                    <span>Replaces {app.replaces}</span>
                  </span>
                </TrackedLink>
              ))}
            </div>
            <p className={styles.appMore}>
              These are just a few of the apps you can run.{" "}
              <TrackedLink className={styles.appMoreLink} href="/start?tab=apps&ref=selfhost-full-catalog" eventName="landing_primary_cta" item="selfhost-full-catalog">
                Explore all supported apps →
              </TrackedLink>
            </p>
          </div>
        </section>

        <section id="trust" className={styles.band}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>features</p>
            <h2 className={styles.secH}>From setup to the next fix.</h2>
            <p className={styles.secP}>Ask in Claude when you need a change, help with a problem or a safer upgrade.</p>
            <div className={styles.steps}>
              {SUPPORT.map(({ icon: Icon, title, text }) => (
                <article key={title} className={styles.step}>
                  <Icon aria-hidden className={styles.stepIcon} />
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
            <ul className={styles.included}>
              {INCLUDED.map((feature) => <li key={feature}><Check aria-hidden /> {feature}</li>)}
            </ul>
          </div>
        </section>

        <section id="pricing" className={`${styles.band} ${styles.tint}`}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>simple, flat pricing</p>
            <h2 className={styles.secH}>One predictable hosting price per app.</h2>
            <p className={styles.secP}>
              Each app runs in its own always-on cloud pod. Choose a size that fits it. There are no usage meters,
              bandwidth bills or per-seat fees from Podway.
            </p>
            <div className={styles.pricing}>
              {PRICING.map((t) => (
                <article key={t.id} className={`${styles.tier} ${t.id === "s" ? styles.tierFeatured : ""}`}>
                  <div className={styles.tierHead}>
                    <h3>{t.name}</h3>
                    <p><strong>${t.monthlyUsd}</strong>/mo</p>
                  </div>
                  <p className={styles.tierBlurb}>{PRICING_COPY[t.id]}</p>
                  <p className={styles.tierSpecs}>{t.ramGb} GB RAM · {t.vcpu} vCPU · {t.diskGb} GB disk</p>
                  <TrackedLink
                    className={t.id === "s" ? styles.btnPrimary : styles.btnSecondary}
                    href={`/start?tab=apps&ref=selfhost-pricing-${t.id}`}
                    eventName="landing_primary_cta"
                    item={`selfhost-pricing-${t.id}`}
                  >
                    Pick an app
                  </TrackedLink>
                </article>
              ))}
            </div>
            <p className={styles.fine}>
              <b>${SIGNUP_CREDIT_USD} in free credit</b> when you add a card. Suspend a pod anytime; it drops to
              ${SUSPENDED_USD}/mo and keeps your data. Bigger sizes available in the dashboard.
            </p>
          </div>
        </section>

        <section id="faq" className={styles.band}>
          <div className={styles.wrap}>
            <p className={styles.eyebrow}>before you hand over the chores</p>
            <h2 className={styles.secH}>What you&rsquo;re probably wondering.</h2>
            <dl className={styles.faq}>
              {FAQS.map((f) => (
                <div key={f.q} className={styles.faqItem}>
                  <dt><span className={styles.faqMark} aria-hidden="true">Q</span>{f.q}</dt>
                  <dd><span className={styles.faqMark} aria-hidden="true">A</span>{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className={`${styles.final} ${styles.lined}`}>
          <div className={styles.wrap}>
            <h2>Launch an app. Manage it in Claude.</h2>
            <p className={styles.sub}>Choose a supported app, review its setup and ask your admin for help with the upkeep.</p>
            <div className={styles.cta}>
              <TrackedLink className={styles.btnPrimary} href={primaryHref} eventName="landing_primary_cta" item="selfhost-final">
                {primaryLabel}
              </TrackedLink>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${styles.wrap} ${styles.footer}`}>
        <span>© 2026 Podway · Open-source apps, hosted on Podway and managed in Claude.</span>
        <nav aria-label="Footer navigation">
          <a href="#apps">Apps</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}
