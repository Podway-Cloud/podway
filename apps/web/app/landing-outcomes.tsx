import Image from "next/image";
import Link from "next/link";
import { Check, Clock3, Database, FolderGit2 } from "lucide-react";
import LandingExamples, { TrackedLink } from "./landing-examples";
import { listEnvironments } from "@/lib/environments";
import { getCurrentUser } from "@/lib/session";
import styles from "./landing.module.css";
import LandingAccountLink from "@/components/landing-account-link";
import LandingFooter from "@/components/landing-footer";
import {
  PRICING_TIERS,
  INCLUDED_FEATURES,
  SIGNUP_CREDIT_USD,
  SUSPENDED_USD,
} from "@/lib/pricing-catalog";
import {
  LANDING_PLAYBOOKS,
  isLandingPlaybook,
  type LandingPlaybookId,
} from "@/lib/landing-playbooks";

export default async function OutcomesLanding({
  user: suppliedUser,
}: {
  user?: Awaited<ReturnType<typeof getCurrentUser>>;
}) {
  const [user, catalog] = await Promise.all([
    suppliedUser === undefined ? getCurrentUser() : suppliedUser,
    listEnvironments(),
  ]);
  const available = new Map(
    catalog
      .filter((entry) => isLandingPlaybook(entry.name))
      .map((entry) => [entry.name, entry]),
  );
  const starters = (Object.keys(LANDING_PLAYBOOKS) as LandingPlaybookId[]).map((id) => ({
    id,
    ...LANDING_PLAYBOOKS[id],
    available: available.has(id),
  }));
  const primaryHref = user ? "/dashboard" : "/signin";
  const primaryLabel = user ? "Open dashboard" : "Request alpha access";

  return (
    <main className={styles.landing}>
      <header className={`${styles.shell} ${styles.header}`}>
        <Link className={styles.brand} href={user ? "/dashboard" : "/"} aria-label="Podway home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.brandMark} src="/podway-mark.svg" alt="" />
          <span className={styles.wordmark}><span>pod</span>way</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          <a href="#starters">Starting points</a>
          <a href="#why-podway">Why Podway</a>
          <a href="#pricing">Pricing</a>
          <Link href="/docs">Docs</Link>
          {user ? <LandingAccountLink user={user} /> : <Link href="/signin">Sign in</Link>}
        </nav>
      </header>

      <section className={`${styles.shell} ${styles.hero}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>For people building with Claude Code</p>
          <h1>Build the idea. <span>Skip the setup.</span></h1>
          <p className={styles.heroText}>
            Choose a starting point, describe the outcome, and start with a working project at a
            live URL, with the infrastructure setup handled.
          </p>
          <div className={styles.heroActions}>
            <TrackedLink
              className={styles.primaryCta}
              href={primaryHref}
              eventName="landing_primary_cta"
              item="hero"
            >
              {primaryLabel}
            </TrackedLink>
            <a className={styles.textLink} href="#starters">Explore starting points <span aria-hidden>↓</span></a>
          </div>
          {!user && <p className={styles.accessNote}>Private alpha · GitHub sign-in</p>}
        </div>
        <LandingExamples />
      </section>

      <section className={styles.catalogBand} id="starters">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Ready starting points</p>
              <h2>Start closer to done.</h2>
            </div>
            <p>Bring a project or choose a prepared outcome, then make the workspace yours.</p>
          </div>
          <div className={styles.starterGrid}>
            {starters.map((starter) => {
              const launchable = starter.readiness === "Ready" && starter.available;
              const availabilityLabel = launchable
                ? "Ready"
                : starter.readiness === "Pilot"
                  ? "Pilot"
                  : "Unavailable";
              const content = (
                <>
                <span className={styles.starterMedia}>
                  <Image src={starter.image} alt={starter.imageAlt} fill sizes="(max-width: 720px) 100vw, 33vw" />
                  <span className={styles.exampleTag}>Concept preview</span>
                  <span className={launchable ? styles.readyTag : styles.pilotTag}>{availabilityLabel}</span>
                </span>
                <span className={styles.starterBody}>
                  <span className={`${styles.starterRule} ${styles[starter.accent]}`} />
                  <strong>{starter.title}</strong>
                  <span>{starter.outcomeDescription}</span>
                  <span className={styles.cardAction}>{launchable ? "Choose this start ↗" : starter.readiness === "Pilot" ? "Pilot in progress" : "Temporarily unavailable"}</span>
                </span>
                </>
              );
              return launchable ? (
                <TrackedLink
                  className={styles.starterCard}
                  href={user ? `/new?env=${starter.id}` : "/signin"}
                  eventName="landing_starter_select"
                  item={starter.id}
                  key={starter.id}
                >
                  {content}
                </TrackedLink>
              ) : (
                <article className={`${styles.starterCard} ${styles.starterUnavailable}`} key={starter.id}>
                  {content}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className={styles.differenceBand} id="why-podway">
        <div className={`${styles.shell} ${styles.difference}`}>
          <div className={styles.differenceCopy}>
            <p className={styles.eyebrow}>Beyond the demo</p>
            <h2>Ready for version two.</h2>
          </div>
          <dl className={styles.differenceList}>
            <div><dt>Bring your own subscription plan</dt><dd>Use the Claude subscription you already pay for through the official CLI. No token markup. Codex support is in pilot.</dd></div>
            <div><dt>A smaller local blast radius</dt><dd>Your agent works inside a project-scoped cloud VM instead of your personal computer. Your laptop, home directory, and local network stay outside that workspace boundary.</dd></div>
            <div><dt>Open it anywhere</dt><dd>Continue from the Claude app on desktop or mobile, or use Podway&rsquo;s browser terminal and live project URL.</dd></div>
            <div><dt>Nothing is locked away</dt><dd>Add tools and integrations, install packages, connect services, and reshape the full project as it grows.</dd></div>
          </dl>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.prepared}`} aria-labelledby="prepared-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Beyond the first prompt</p>
            <h2 id="prepared-title">The project has somewhere to keep going.</h2>
          </div>
          <p>A starting point becomes a workspace your agent can operate, inspect, and return to, not a generated demo you have to move elsewhere.</p>
        </div>
        <div className={styles.preparedList}>
          <article><span className={styles.preparedIcon}><FolderGit2 aria-hidden /></span><h3>The agent knows the project</h3><p>Your repo, project guidance, tools, and durable working notes stay together for the next session.</p></article>
          <article><span className={styles.preparedIcon}><Database aria-hidden /></span><h3>Services live beside the app</h3><p>Local data and long-running processes can be configured, used, and verified in the same workspace.</p></article>
          <article><span className={styles.preparedIcon}><Clock3 aria-hidden /></span><h3>Work can continue</h3><p>The workspace stays available for long tasks and prepared recurring work without depending on your laptop.</p></article>
        </div>
      </section>

      <section className={styles.pricingBand} id="pricing">
        <div className={styles.shell}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Simple, flat pricing</p>
              <h2>Keep your agent running from ${PRICING_TIERS[0].monthlyUsd}/month.</h2>
            </div>
            <p>Pick a size and pay one price a month. No usage meters, no bandwidth charges, no surprise bills.</p>
          </div>
          <div className={styles.pricingGrid}>
            {PRICING_TIERS.map((t, i) => {
              const accents = [styles.cyan, styles.blue, styles.violet, styles.lime, styles.amber];
              return (
                <article
                  key={t.id}
                  className={`${styles.pricingCard} ${t.tag === "default" ? styles.pricingCardFeatured : ""}`}
                >
                  <span className={`${styles.pricingRule} ${accents[i % accents.length]}`} />
                  {t.tag === "default" && <span className={styles.pricingTag}>Most popular</span>}
                  {t.tag === "light" && <span className={`${styles.pricingTag} ${styles.pricingTagLight}`}>Light</span>}
                  <strong className={styles.pricingName}>{t.name}</strong>
                  <span className={styles.pricingPrice}>
                    <b>${t.monthlyUsd}</b>/mo
                  </span>
                  <span className={styles.pricingBlurb}>{t.blurb}</span>
                  <dl className={styles.pricingSpecs}>
                    <div><dt>RAM</dt><dd>{t.ramGb} GB</dd></div>
                    <div><dt>vCPU</dt><dd>{t.vcpu} burst</dd></div>
                    <div><dt>Disk</dt><dd>{t.diskGb} GB</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>
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
              <p className={styles.pricingCredit}>
                <strong>${SIGNUP_CREDIT_USD} in free credit</strong> when you add a card.
              </p>
              <p className={styles.pricingPause}>
                Suspend a pod anytime and it drops to ${SUSPENDED_USD}/mo while we keep your disk safe.
              </p>
              <TrackedLink
                className={styles.primaryCta}
                href={primaryHref}
                eventName="landing_primary_cta"
                item="pricing"
              >
                {primaryLabel}
              </TrackedLink>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.shell} ${styles.finalCta}`} id="alpha-access">
        <p className={styles.eyebrow}>Private alpha</p>
        <h2>Your next project starts here.</h2>
        <TrackedLink
          className={styles.primaryCta}
          href={primaryHref}
          eventName="landing_primary_cta"
          item="footer"
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
