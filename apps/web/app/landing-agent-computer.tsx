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
  Globe2,
  KeyRound,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import dashboardImage from "../../../docs/images/dashboard.png";
import ImageLightbox from "@/components/image-lightbox";
import { TrackedLink } from "./landing-examples";
import { getCurrentUser } from "@/lib/session";
import styles from "./landing-agent.module.css";
import GithubMark from "@/components/github-mark";
import LandingAccountLink from "@/components/landing-account-link";
import LandingFooter from "@/components/landing-footer";
import LandingPodNetwork from "./landing-pod-network";
import QuoteWall from "@/components/landing-quote-wall";
import { LandingSection } from "./landing-section";
import {
  PRICING_TIERS,
  INCLUDED_FEATURES,
  SIGNUP_CREDIT_USD,
  SUSPENDED_USD,
} from "@/lib/pricing-catalog";

export default async function AgentComputerLanding({
  user: suppliedUser,
}: {
  user?: Awaited<ReturnType<typeof getCurrentUser>>;
}) {
  const user = suppliedUser === undefined ? await getCurrentUser() : suppliedUser;
  const primaryHref = user ? "/dashboard" : "/signin";
  const primaryLabel = user ? "Open dashboard" : "Start with Podway";

  return (
    <main className={styles.landing}>
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
          <p className={styles.eyebrow}>Claude is the interface. Podway is its computer.</p>
          <h1>Give <span className={styles.noWrap}>Claude Code</span> an always-on computer.</h1>
          <p className={styles.heroText}>
            We call it a pod: a private cloud computer with your project, tools, and services inside.
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
              <strong>Continue in the official Claude apps with your Pro or Max subscription.</strong>
            </span>
          </div>
        </div>

        <figure className={styles.heroVisual}>
          <div className={styles.dashboardFrame}>
            <div className={styles.dashboardBar} aria-hidden>
              <i /><i /><i />
              <span>podway dashboard</span>
            </div>
            <ImageLightbox
              className={styles.dashboardImage}
              src={dashboardImage}
              alt="Podway dashboard showing pods that are working, idle, or waiting for a reply, with app previews"
              priority
              sizes="(max-width: 1050px) 100vw, 58vw"
            />
          </div>
          <figcaption>
            <strong>See every pod at a glance.</strong>
          </figcaption>
        </figure>
      </section>

      <LandingSection
        id="workspace"
        ariaLabel="Claude on desktop and mobile connected to one running pod"
      >
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Desktop, phone, or web</p>
            <h2>Continue anywhere.</h2>
          </div>
          <p>Close your laptop and Claude keeps working in the pod. Pick up the same session from desktop, mobile, or web without restarting or moving the project.</p>
        </div>
        <div className={styles.continuityVisual}>
          <div className={styles.continuityArtwork}>
            <Image
              src="/landing/session-continuity-v10.png"
              alt="One Claude session moving from a desktop app through an always-on Podway virtual workspace to a phone"
              width={1825}
              height={862}
              sizes="(max-width: 700px) 100vw, 770px"
            />
          </div>
          <div className={styles.continuitySteps} aria-hidden>
            <span><strong>01</strong> Start on desktop</span>
            <span><strong>02</strong> Pod runs 24/7</span>
            <span><strong>03</strong> Continue on phone</span>
          </div>
        </div>
      </LandingSection>

      {/* The without/with comparison. Asked for by a real reader of this page (Nadya, 2026-09-06):
          "I'm missing a small comparison table — how it is without a pod and how with, what I don't
          have in Claude and this gives". Placed straight after "Continue anywhere", which is where
          that question forms: the reader has just been told the session persists and wants to know
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
        <article className={styles.changeCard}>
          <Boxes className={styles.changeIcon} aria-hidden />
          <h3>Keep the whole stack running</h3>
          <dl>
            <dt>Laptop</dt><dd>Servers, databases, workers, and scheduled jobs stop when your laptop does.</dd>
            <dt>Pod</dt><dd>Dev servers, databases, workers, scheduled jobs, monitors, and project skills stay together and keep running.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <Eye className={styles.changeIcon} aria-hidden />
          <h3>Test and verify the real app</h3>
          <dl>
            <dt>Laptop</dt><dd>Builds slow your laptop, and there&rsquo;s no live app to check.</dd>
            <dt>Pod</dt><dd>Claude builds, runs it, and clicks through the live app to verify &mdash; while you&rsquo;re away.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <Globe2 className={styles.changeIcon} aria-hidden />
          <h3>Develop or run in production</h3>
          <dl>
            <dt>Laptop</dt><dd>Localhost only &mdash; going live means deploying to a third-party service.</dd>
            <dt>Pod</dt><dd>Develop with a live preview, or run your production server directly from the pod.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <ShieldCheck className={styles.changeIcon} aria-hidden />
          <h3>Protect your personal environment</h3>
          <dl>
            <dt>Laptop</dt><dd>Claude works on your everyday computer.</dd>
            <dt>Pod</dt><dd>Claude works in an isolated computer, away from your personal files, browser sessions, and local network.</dd>
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

      <QuoteWall />

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
      </LandingSection>

      <LandingFooter
        className={`${styles.shell} ${styles.footer}`}
        wordmarkClassName={styles.wordmark}
      />
    </main>
  );
}
