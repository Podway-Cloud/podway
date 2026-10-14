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
const CLOUD_VS_POD: readonly (readonly [string, string, string])[] = [
  ["Keeps working with the laptop closed", "Yes", "Yes"],
  ["When it\u2019s idle", "The machine is reclaimed; your chat comes back, running work doesn\u2019t", "Stays on. Nothing is reclaimed"],
  ["Dev servers, databases, workers", "Stop with the machine", "Keep running"],
  ["Starts from", "A fresh copy of your GitHub repo", "Your files, tools and services, already there"],
  ["Cost", "Included in your Claude plan", "Pods start at $4/month. First one free to start"],
];

const FAQ: readonly (readonly [string, string])[] = [
  ["Do I need a Claude plan?", "Yes. You sign in with your own Claude Pro or Max plan. Podway runs the official Claude Code CLI and doesn\u2019t add any markup."],
  ["Claude Code has cloud sessions now. Why would I need a pod?", "Cloud sessions are great for one-off tasks on a GitHub repo, and they\u2019re included in your plan. But they\u2019re sessions, not a computer you keep: when one goes idle, the machine is reclaimed and anything running in the background stops. A pod stays on. Your dev server, database and scheduled jobs keep running, and your files are still there tomorrow."],
  ["Can I use it from my phone?", "Yes. Your Claude Code session is always running on the pod, so you open it from the Claude app on your phone, no PC needed."],
  ["What if Remote Control drops?", "If Claude\u2019s login expires or the agent crashes, Podway restarts it and reconnects Remote Control on its own. If the connection drops without an error, Podway notices within about 3 minutes and reconnects. Pod restarts and updates reconnect too."],
  ["Can I start several sessions from my phone?", "Each pod runs one always-on session. For several jobs at once, use several pods."],
];

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

      {/* "Commute" demo film (approved by the owner via the podway GTM pod, 2026-09-29; it REPLACES the
          old "Continue anywhere" laptop → phone picture, owner call): a silent,
          self-contained coded animation. It sets page-wide styles (body, h1, *), so it lives in a
          same-origin frame rather than inline, sized to its content (LandingDemoFrame). */}
      <LandingSection id="demo" ariaLabel="A short demo: start at your desk, continue from your phone">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Desktop, phone, or web</p>
            <h2>Start at your desk. Continue from your phone.</h2>
          </div>
        </div>
        <LandingDemoFrame className={styles.demoFrame} />
      </LandingSection>


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

      <LandingSection id="cloud-vs-pod">
        <div className={styles.sectionHeading}>
          <div>
            <h2>Claude Code cloud sessions or a pod?</h2>
          </div>
          <p>Both keep Claude working when your laptop is closed. The difference is what&rsquo;s still there when you come back.</p>
        </div>
        <div className={styles.compareWrap}>
          <table className={styles.compareTable}>
            <thead>
              <tr><th scope="col"><span className={styles.srOnly}>Question</span></th><th scope="col">Cloud session</th><th scope="col">Pod</th></tr>
            </thead>
            <tbody>
              {CLOUD_VS_POD.map(([q, cloud, pod]) => (
                <tr key={q}><th scope="row">{q}</th><td>{cloud}</td><td>{pod}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.compareNote}>Use cloud sessions for one-off repo tasks. Use a pod for work that has to keep running.</p>
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
          {FAQ.map(([q, a]) => (
            <details key={q} className={styles.faqItem}>
              <summary>{q}</summary>
              <p>{a}</p>
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
