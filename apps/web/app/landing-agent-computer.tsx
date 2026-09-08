import Image from "next/image";
import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
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

      <section
        className={`${styles.shell} ${styles.continuity}`}
        id="workspace"
        aria-label="Claude on desktop and mobile connected to one running pod"
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
      </section>

      {/* The without/with comparison. Asked for by a real reader of this page (Nadya, 2026-09-06):
          "I'm missing a small comparison table — how it is without a pod and how with, what I don't
          have in Claude and this gives". Placed straight after "Continue anywhere", which is where
          that question forms: the reader has just been told the session persists and wants to know
          what that actually changes for them.

          Every row restates a claim this page ALREADY makes further down. A comparison table is the
          easiest place on a landing page to drift into a promise the product does not keep, so the
          rule here is: if a row is not backed by a section below, it does not belong. */}
      <section className={`${styles.shell} ${styles.compareBand}`} id="compare" aria-label="Claude Code with and without a pod">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>What changes</p>
            <h2>Without a pod, and with one.</h2>
          </div>
          <p>Claude Code is the same either way. What changes is where it lives.</p>
        </div>
        {/* Four before/after cards, not a 3-column table (owner call, 2026-09-06: crowded on
            desktop, and on a phone it repeated its two column labels eight times). Each card names
            ONE difference and states both sides once. Icons are chosen to mean the row — ShieldCheck
            is deliberately the same icon the security section below uses. */}
        <div className={styles.changeGrid}>
        <article className={styles.changeCard}>
          <h3><MonitorSmartphone aria-hidden />Switch devices</h3>
          <dl>
            <dt>Laptop</dt><dd>Your session stays on that machine.</dd>
            <dt>Pod</dt><dd>Continue the same session from desktop, phone, or web.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <h3><Server aria-hidden />Keep your stack running</h3>
          <dl>
            <dt>Laptop</dt><dd>Servers, databases, workers, and scheduled jobs stop when your laptop does.</dd>
            <dt>Pod</dt><dd>Your entire development environment is always up and accessible.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <h3><FlaskConical aria-hidden />Test the real app</h3>
          <dl>
            <dt>Laptop</dt><dd>Your builds, tests, and Claude agent drain your laptop resources.</dd>
            <dt>Pod</dt><dd>Claude can run builds and tests on a real app safely, even while you&rsquo;re away.</dd>
          </dl>
        </article>
        <article className={styles.changeCard}>
          <h3><ShieldCheck aria-hidden />Protect your personal environment</h3>
          <dl>
            <dt>Laptop</dt><dd>Claude works on your everyday computer.</dd>
            <dt>Pod</dt><dd>Claude works in an isolated computer, away from your personal files, browser sessions, and local network.</dd>
          </dl>
        </article>
        </div>
      </section>

      <section className={styles.reasonsBand} id="why">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>More than remote access</p>
              <h2>Run the whole project. See the result.</h2>
            </div>
            <p>A pod gives Claude a complete environment to build, run, and test your project.</p>
          </div>
          <div className={styles.reasons}>
            <article>
              <Boxes aria-hidden />
              <h3>Run more than code</h3>
              <p>Development servers, databases, workers, scheduled jobs, monitors, and project skills stay together and keep running.</p>
            </article>
            <article>
              <Eye aria-hidden />
              <h3>Verify the real app</h3>
              <p>Claude can open the live application, click through real flows, use its database, and verify behavior where it made the change.</p>
            </article>
            <article>
              <Globe2 aria-hidden />
              <h3>Develop or run in production</h3>
              <p>Use the pod for development with a live preview, or run your production server directly from the pod.</p>
            </article>
          </div>
          <LandingPodNetwork />
        </div>
      </section>

      <section className={styles.trustBand} id="trust">
        <div className={`${styles.shell} ${styles.trust}`}>
          <div>
            <p className={styles.eyebrow}>A boundary for agent work</p>
            <h2>Powerful inside the pod. Guarded at the edges.</h2>
          </div>
          <div className={styles.trustGrid}>
            <article>
              <ShieldCheck aria-hidden />
              <h3>Project-scoped machine</h3>
              <p>The pod gets this project&rsquo;s code and services, not your personal files, browser sessions, or local network.</p>
            </article>
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
      </section>

      <section className={`${styles.shell} ${styles.finalCta}`}>
        <p className={styles.eyebrow}>Private alpha</p>
        <h2>Give your <span className={styles.noWrap}>Claude Code</span> a permanent home</h2>
        <TrackedLink
          className={styles.primaryCta}
          href={primaryHref}
          eventName="landing_primary_cta"
          item="agent-computer-footer"
        >
          {primaryLabel}
        </TrackedLink>
      </section>

      <LandingFooter
        className={`${styles.shell} ${styles.footer}`}
        wordmarkClassName={styles.wordmark}
      />
    </main>
  );
}
