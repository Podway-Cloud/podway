import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  Check,
  Eye,
  FlaskConical,
  MonitorSmartphone,
  Server,
  KeyRound,
  MessagesSquare,
  ShieldCheck,
  Wifi,
  Zap,
  Wrench,
} from "lucide-react";
import { TrackedLink } from "./landing-examples";
import { getCurrentUser } from "@/lib/session";
import styles from "./landing-agent.module.css";
import GithubMark from "@/components/github-mark";
import LandingAccountLink from "@/components/landing-account-link";
import LandingFooter from "@/components/landing-footer";
import LandingPodNetwork from "./landing-pod-network";
import LandingDemoFrame from "./landing-demo-frame";
import { LandingSection } from "./landing-section";
import {
  PRICING_TIERS,
  INCLUDED_FEATURES,
  SIGNUP_CREDIT_USD,
  SUSPENDED_USD,
} from "@/lib/pricing-catalog";

// Owner-approved copy (via the podway GTM pod, confirmed in chat 2026-10-14). Cloud-session facts:
// code.claude.com/docs/en/claude-code-on-the-web ("Environment expired": the VM is reclaimed when idle;
// conversation restored, running background work not).
// Ordered by demand (GTM search + issue research, 2026-10-15): plan/pricing, Remote Control, phone, cloud.
// A blank line in an answer starts a new paragraph; the optional 3rd item is an anchor id.
const FAQ: readonly (readonly [string, string, string?])[] = [
  ["Do I need a Claude plan?", "Yes, Claude Pro or Max. Podway runs the official Claude Code CLI and adds no markup."],
  ["What if Remote Control drops?", "Podway reconnects it for you. After a crash or an expired login, it restarts Claude. A silent drop is caught within about 3 minutes. Restarts and updates reconnect too."],
  ["Can I use it from my phone?", "Yes. The session runs on the pod, so you open it in the Claude app on your phone. No computer needed."],
  ["Claude Code cloud sessions or a pod?", "Both work with your laptop closed.\n\nA cloud session comes with your Claude plan. When it\u2019s idle, the machine is reclaimed: your chat stays, but servers and running work stop. Each session starts from a fresh copy of your repo.\n\nA pod costs from $4/month, and your first pod is free. It stays on: servers, databases, and workers keep running, and your files and tools are already there.\n\nUse cloud sessions for one-off repo tasks. Use a pod for work that keeps running.", "cloud-vs-pod"],
  ["Can I run several sessions at once?", "Each pod runs one always-on session. For more jobs at once, use more pods."],
];

export default async function AgentComputerLanding({
  user: suppliedUser,
}: {
  user?: Awaited<ReturnType<typeof getCurrentUser>>;
}) {
  const user = suppliedUser === undefined ? await getCurrentUser() : suppliedUser;
  // Signed out → the public catalog (Workspaces tab) and its signed-out wizard; sign-in comes at Create
  // (landing-funnel-fixes, owner 2026-10-14).
  const primaryHref = user ? "/dashboard" : "/start?ref=agent-computer";
  const primaryLabel = user ? "Open dashboard" : "Start with Podway";

  return (
    <main className={styles.landing}>
      <p className={styles.offerBanner}>Your first pod is free during early access. No card needed.</p>
      <header className={`${styles.shell} ${styles.header}`}>
        <Link className={styles.brand} href={user ? "/dashboard" : "/"} aria-label="Podway home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.brandMark} src="/podway-mark.svg" alt="" />
          <span className={styles.wordmark}><span>pod</span>way</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#why">Why Podway</a>
          <a href="#workspace">How it works</a>
          <a href="#trust">Safety</a>
          <a href="#pricing">Pricing</a>
          <Link href="/docs">Docs</Link>
          {user ? <LandingAccountLink user={user} /> : <Link href="/signin">Sign in</Link>}
        </nav>
      </header>

      <section className={`${styles.shell} ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <h1>Give <span className={styles.noWrap}>Claude Code</span> a computer that never sleeps.</h1>
          <p className={styles.heroText}>
            Your session, your dev server and your database keep running when your laptop is closed. Open it
            from the Claude app on your phone.
          </p>
          <div className={styles.heroActions}>
            <TrackedLink
              className={styles.primaryCta}
              href={primaryHref}
              eventName="landing_primary_cta"
              item="agent-computer-hero"
            >
              {primaryLabel}
            </TrackedLink>
            <a
              className={styles.secondaryCta}
              href="https://github.com/podway-cloud/podway"
              target="_blank"
              rel="noopener"
            >
              <GithubMark /> Self-host Podway <ArrowUpRight aria-hidden />
            </a>
          </div>
          <div className={styles.subscriptionLine}>
            <KeyRound aria-hidden />
            <span className={styles.subscriptionCopy}>
              <strong>You bring your Claude Pro or Max plan.</strong>
            </span>
          </div>
        </div>

        {/* The "Commute" film is the hero visual (owner, 2026-10-14): it shows the product — start at the
            desk, continue from the phone — where the still dashboard picture only showed a screen. */}
        <figure className={styles.heroVisual} aria-label="A short demo: start at your desk, continue from your phone">
          <LandingDemoFrame className={styles.demoFrame} />
        </figure>
      </section>

      {/* The without/with comparison. Asked for by a real reader of this page (Nadya, 2026-09-06):
          "I'm missing a small comparison table — how it is without a pod and how with, what I don't
          have in Claude and this gives". Placed straight after the demo film, which is where
          that question forms: the reader has just watched the session persist and wants to know
          what that actually changes for them.

          Every row restates a claim this page ALREADY makes further down. A comparison table is the
          easiest place on a landing page to drift into a promise the product does not keep, so the
          rule here is: if a row is not backed by a section below, it does not belong. */}
      <LandingSection id="compare" ariaLabel="Claude Code with and without a pod">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>What changes</p>
            <h2>Without a pod, and with one.</h2>
          </div>
          <p>Claude Code is the same either way. What changes is where it lives.</p>
        </div>
        {/* Before/after cards with a large colored icon each. Extended with the copy that used to
            live in the separate "More than remote access" section (now folded in here). Each card
            names ONE difference and states both sides once. */}
        <div className={styles.changeGrid}>
        {/* Ordered by demand: GitHub issue themes + Google searches (GTM research, 2026-10-15). */}
        <article className={styles.changeCard}>
          <Zap className={styles.changeIcon} aria-hidden />
          <h3>No more permission prompts</h3>
          <dl>
            <dt>Laptop</dt><dd>Claude stops to ask before each command.</dd>
            <dt>Pod</dt><dd>Claude runs without prompts and keeps going. Other pods can wake it with a message, and Autopilot nudges it when it stops.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <Wifi className={styles.changeIcon} aria-hidden />
          <h3>No more dropped sessions</h3>
          <dl>
            <dt>Laptop</dt><dd>The session drops when your laptop sleeps, crashes, or updates.</dd>
            <dt>Pod</dt><dd>The session runs on the pod around the clock. Podway reconnects Remote Control and keeps you signed in.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <ShieldCheck className={styles.changeIcon} aria-hidden />
          <h3>Your laptop stays yours</h3>
          <dl>
            <dt>Laptop</dt><dd>Claude works on your everyday computer.</dd>
            <dt>Pod</dt><dd>Claude works on an isolated computer. Your files, browser, and network stay out of reach.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <MessagesSquare className={styles.changeIcon} aria-hidden />
          <h3>No more lost conversations</h3>
          <dl>
            <dt>Laptop</dt><dd>A crash or a new laptop loses the thread.</dd>
            <dt>Pod</dt><dd>Conversations live on the pod&rsquo;s disk and in the nightly backup. They resume after restarts.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <Boxes className={styles.changeIcon} aria-hidden />
          <h3>Nothing stops when you close the lid</h3>
          <dl>
            <dt>Laptop</dt><dd>Servers and jobs stop when your laptop does.</dd>
            <dt>Pod</dt><dd>Servers, databases, workers, and jobs run around the clock. Develop with a live preview, or serve production from the pod.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <Eye className={styles.changeIcon} aria-hidden />
          <h3>Claude checks its own work</h3>
          <dl>
            <dt>Laptop</dt><dd>Builds slow your laptop, and there is no live app to check.</dd>
            <dt>Pod</dt><dd>Claude builds and runs the app, then clicks through it to check its work.</dd>
          </dl>
        </article>
        </div>
      </LandingSection>

      <LandingSection id="fleet">
        <LandingPodNetwork />
      </LandingSection>

      <LandingSection id="trust">
        <div className={styles.trust}>
          <div>
            <p className={styles.eyebrow}>A boundary for agent work</p>
            <h2>Powerful inside the pod. Guarded at the edges.</h2>
          </div>
          <div className={styles.trustGrid}>
            <article>
              <KeyRound aria-hidden />
              <h3>Project secrets, outside chat</h3>
              <p>Add project credentials in the dashboard instead of pasting secret values into a conversation.</p>
            </article>
            <article>
              <ShieldCheck aria-hidden />
              <h3>Official CLI, your account</h3>
              <p>Claude runs through the official CLI with your subscription. Podway does not proxy model authentication or add token markup.</p>
            </article>
            <article>
              <Wrench aria-hidden />
              <h3>You keep full access</h3>
              <p>Open the browser terminal whenever you want to inspect, debug, or recover the workspace.</p>
            </article>
          </div>
        </div>
      </LandingSection>

      <LandingSection id="faq">
        <div className={styles.sectionHeading}>
          <div>
            <h2>Questions</h2>
          </div>
        </div>
        <div className={styles.faqList}>
          {FAQ.map(([q, a, id]) => (
            <details key={q} id={id} className={styles.faqItem}>
              <summary>{q}</summary>
              {a.split("\n\n").map((para) => <p key={para}>{para}</p>)}
            </details>
          ))}
        </div>
      </LandingSection>

      <LandingSection id="pricing">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Simple, flat pricing</p>
              <h2>Keep your agent running from ${PRICING_TIERS[0].monthlyUsd}/month.</h2>
            </div>
            <p>Pick a size and pay one price a month. No usage meters, no bandwidth charges, no surprise bills.</p>
          </div>
          <div className={styles.pricingGrid}>
            {PRICING_TIERS.map((t) => (
              <article
                key={t.id}
                className={`${styles.pricingCard} ${t.tag === "default" ? styles.pricingCardFeatured : ""}`}
              >
                {t.tag === "default" && <span className={styles.pricingTagPopular}>Most popular</span>}
                {t.tag === "light" && <span className={styles.pricingTagLight}>Light</span>}
                <h3>{t.name}</h3>
                <p className={styles.pricingPrice}>
                  <strong>${t.monthlyUsd}</strong>
                  <span>/mo</span>
                </p>
                <p className={styles.pricingBlurb}>{t.blurb}</p>
                <dl className={styles.pricingSpecs}>
                  <div><dt>RAM</dt><dd>{t.ramGb} GB</dd></div>
                  <div><dt>vCPU</dt><dd>{t.vcpu} burst</dd></div>
                  <div><dt>Disk</dt><dd>{t.diskGb} GB</dd></div>
                </dl>
                {/* Launch a blank workspace at this size — /start carries the size + ref through
                    sign-in and opens the prefilled wizard (name focused, size preselected). */}
                <TrackedLink
                  className={`${styles.pricingCta} ${t.tag === "default" ? styles.pricingCtaFeatured : ""}`}
                  href={`/start?size=${t.id}&ref=pricing`}
                  eventName="landing_primary_cta"
                  item={`pricing-${t.id}`}
                >
                  Get started
                </TrackedLink>
              </article>
            ))}
          </div>
          <p className={styles.pricingCredit}>
            <strong>${SIGNUP_CREDIT_USD} in free credit</strong> when you add a card.
          </p>
          <div className={styles.pricingFooter}>
            <div className={styles.pricingIncludes}>
              <h3>Every pod includes</h3>
              <ul>
                {INCLUDED_FEATURES.map((f) => (
                  <li key={f}><Check aria-hidden /> {f}</li>
                ))}
              </ul>
            </div>
            <div className={styles.pricingAside}>
              <p className={styles.pricingPause}>
                Suspend a pod anytime and it drops to ${SUSPENDED_USD}/mo while we keep your disk safe.
              </p>
            </div>
          </div>
      </LandingSection>

      <LandingSection className={styles.finalCta}>
        <h2>Give your <span className={styles.noWrap}>Claude Code</span> a permanent home</h2>
        <TrackedLink
          className={styles.primaryCta}
          href={primaryHref}
          eventName="landing_primary_cta"
          item="agent-computer-footer"
        >
          {primaryLabel}
        </TrackedLink>
        <p className={styles.founderNote}>
          I built podway because I wanted Claude Code to keep working when I closed my laptop, and I didn&rsquo;t want
          to babysit a server to get there. If you like podway, want to complain about something, or just want to
          chitchat, <a href="mailto:itzhak@podway.io">drop me a note</a>. I read every email. <span>&mdash; Itzhak</span>
        </p>
      </LandingSection>

      <LandingFooter
        className={`${styles.shell} ${styles.footer}`}
        wordmarkClassName={styles.wordmark}
      />
    </main>
  );
}
