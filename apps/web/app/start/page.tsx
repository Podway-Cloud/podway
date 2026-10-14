import { redirect } from "next/navigation";
import { getCurrentUser, editionOss } from "@/lib/session";
import { getEnvironmentDetail } from "@/lib/environments";
import { recordFirstTouchRef, savePendingStart, claimOffer, applyRefCookie } from "@/lib/attribution";
import { currentUserAllowed } from "@/lib/access";
import { sanitizeRef, FREE_POD_OFFERS } from "@podway/shared";
import { POD_SIZES, CARDED_RAM_GB, noCardRamGb, type PodSize } from "@podway/shared/tiers";
import { stripeConfigured } from "@podway/control-plane";
import LaunchConfigure from "@/components/launch-configure";
import DashboardPage from "@/components/dashboard-page";
import EnvGallery from "@/components/env-gallery";
import { isProvisioningEnabled } from "@/lib/pod-service";
import { harnessEnabled } from "@/lib/agent-harness";

export const dynamic = "force-dynamic";

/** The env a size-only deep link (pricing card, no app) launches: a blank bring-your-own-repo
 * workspace at the chosen size. */
const SIZE_ONLY_ENV = "byo-project";

/**
 * The deep-link entry (deeplink-onboarding): `/start?app=<slug>&ref=<source>`. One link for
 * outreach (affiliate links, warm intros, a Show-HN clip) that preselects a catalog app and
 * captures the referral source — the branch (signed in vs not) is invisible to the visitor.
 *
 * - `app` is validated against the catalog; unknown/absent falls back to the normal catalog —
 *   NEVER an error page, and NEVER a launch on its own (a pod is only ever created by an
 *   explicit click in the wizard).
 * - `tab=apps` selects the Apps tab when falling back to the catalog, including after sign-in.
 * - Unauthenticated → sign-in first, carrying `app`+`ref` via the sign-in flow's OWN
 *   round-tripped state: `next=/start?app=…&ref=…` becomes better-auth's `callbackURL`, which
 *   is what GitHub's OAuth `state` round-trips back — so the selection survives the redirect
 *   without a bare query param riding along (see signin-experience delta). Landing back here,
 *   now authenticated, re-enters this same handler.
 * - Authenticated → first-touch `ref` is recorded on the account (cloud only; never overwritten
 *   — see lib/attribution.ts), then straight to the create wizard, PREFILLED for `app`.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ app?: string; ref?: string; name?: string; size?: string; tab?: string }>;
}) {
  const { app, ref: rawRef, name: rawName, size: rawSize, tab: rawTab } = await searchParams;
  const ref = sanitizeRef(rawRef);
  const tab = rawTab === "apps" ? "apps" : null;
  // Optional pod NAME the link can preset (e.g. /start?app=n8n&name=Acme%20automations). Light
  // sanitize only — the wizard + launchPod validate it; absent → the wizard's "my <app>" default.
  const name = rawName?.trim().replace(/\s+/g, " ").slice(0, 60) || undefined;
  // Optional SIZE the link can preselect (a pricing card: /start?size=m). Validated against the tier
  // list; the wizard floors it to the env's minSize. A size WITHOUT an app means "a blank workspace
  // at this size" (the default-landing pricing cards).
  const size = (POD_SIZES as readonly string[]).includes(rawSize ?? "") ? rawSize : undefined;

  const qp = new URLSearchParams();
  if (app) qp.set("app", app);
  if (ref) qp.set("ref", ref);
  if (name) qp.set("name", name);
  if (size) qp.set("size", size);
  if (tab) qp.set("tab", tab);
  const startPath = `/start${qp.size ? `?${qp.toString()}` : ""}`;

  const user = await getCurrentUser();
  if (!user) {
    // Cloud app link: show the app's wizard BEFORE sign-in; Create asks for it (landing-funnel-fixes —
    // the one Show HN visitor who clicked an app left at the sign-in wall). OSS, the catalog (no app),
    // and BYO-repo envs (the repo picker needs a GitHub login) keep sign-in first.
    // The landing's main button (`/start?tab=apps`, no app): the catalog, public; its cards open the
    // signed-out wizard below with the same ref.
    if (!editionOss() && !app && !size) {
      return (
        <main className="mx-auto w-full max-w-6xl px-4 py-8">
          <DashboardPage
            backHref="/"
            backLabel="Podway"
            title="Create a pod"
            intro="Pick an app. You choose its size and name next, and sign in only when you create it."
            wide
          >
            <EnvGallery publicRef={ref ?? ""} />
          </DashboardPage>
        </main>
      );
    }
    const anonDetail = !editionOss() && app ? await getEnvironmentDetail(app) : null;
    if (!anonDetail || anonDetail.byoRepo) redirect(`/signin?next=${encodeURIComponent(startPath)}`);
    const offer = ref && Object.hasOwn(FREE_POD_OFFERS, ref) ? FREE_POD_OFFERS[ref] : undefined;
    const freeGb = noCardRamGb(ref, offer?.ramGb ?? 0);
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <DashboardPage
          backHref="/"
          backLabel="Podway"
          title={`New pod — ${anonDetail.title}`}
          intro={anonDetail.kind === "app" ? anonDetail.descriptionLong || undefined : undefined}
        >
          <LaunchConfigure
            env={anonDetail.name}
            secrets={anonDetail.secrets}
            minSize={anonDetail.minSize}
            sizeNote={anonDetail.sizeNote}
            appName={anonDetail.kind === "app" ? anonDetail.title : undefined}
            agentIds={anonDetail.agentIds}
            enabled={isProvisioningEnabled()}
            // No hard RAM wall before sign-in: the real budget is enforced on the signed-in wizard.
            ram={{ used: 0, cap: CARDED_RAM_GB, unlimited: false }}
            oss={false}
            t3Enabled={harnessEnabled("t3")}
            initialName={name || `my ${anonDetail.title}`}
            initialSize={size as PodSize | undefined}
            deeplink
            refSource={ref ?? undefined}
            billingEnabled={stripeConfigured()}
            freeRamGb={freeGb}
            freeOffer={offer}
            signInHref={`/signin?next=${encodeURIComponent(startPath)}`}
          />
        </DashboardPage>
      </main>
    );
  }

  // First-touch attribution: cloud growth concept only — self-host has no affiliate/attribution
  // surface (edition-parity). Set-once, never overwritten (recordFirstTouchRef).
  // The first page's ?ref= (cookie) is the true first touch, so it goes first; set-once keeps it.
  if (!editionOss()) await applyRefCookie(user.id);
  if (!editionOss() && ref) {
    await recordFirstTouchRef(user.id, ref);
    // Free-pod offer link (selfh.st insider, partners): claim it while under its cap — existing accounts too.
    await claimOffer(user.id, ref);
  }

  // Cloud invite gate: an account still waiting for approval keeps THIS link (app + ref) on the
  // account, so approval — the /pending page and the "you're in" email — brings them back here with
  // their app picked, instead of the bare dashboard (GTM campaign links, 2026-10-07).
  if (!editionOss() && !(await currentUserAllowed()).allowed) {
    await savePendingStart(user.id, startPath);
    redirect("/pending");
  }

  // `app` wins; otherwise a size-only link launches the blank workspace at that size. Neither → the
  // catalog (unchanged). Unknown app → catalog (spec: unknown app falls back safely).
  const envSlug = app || (size ? SIZE_ONLY_ENV : undefined);
  const detail = envSlug ? await getEnvironmentDetail(envSlug) : null;
  if (!detail) redirect(tab === "apps" ? "/dashboard/create?tab=apps" : "/dashboard/create");

  // Hand off to the existing prefilled-wizard route. `from=deeplink` marks this as a deep-link
  // create so the wizard pre-generates a name and the pod's post-create moment shows the 2-card
  // walkthrough instead of the default coach-mark tour; `ref` (if any) carries through so
  // launchPod can tag THIS pod with the session's active source (may be fresher than the
  // account's first-touch ref).
  const wizard = new URLSearchParams({ env: detail.name, from: "deeplink" });
  if (ref) wizard.set("ref", ref);
  if (name) wizard.set("name", name);
  if (size) wizard.set("size", size);
  redirect(`/dashboard/pods/new?${wizard.toString()}`);
}
