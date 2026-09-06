import { redirect } from "next/navigation";
import { getCurrentUser, editionOss } from "@/lib/session";
import { getEnvironmentDetail } from "@/lib/environments";
import { recordFirstTouchRef } from "@/lib/attribution";
import { sanitizeRef } from "@podway/shared";

export const dynamic = "force-dynamic";

/**
 * The deep-link entry (deeplink-onboarding): `/start?app=<slug>&ref=<source>`. One link for
 * outreach (affiliate links, warm intros, a Show-HN clip) that preselects a catalog app and
 * captures the referral source — the branch (signed in vs not) is invisible to the visitor.
 *
 * - `app` is validated against the catalog; unknown/absent falls back to the normal catalog —
 *   NEVER an error page, and NEVER a launch on its own (a pod is only ever created by an
 *   explicit click in the wizard).
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
  searchParams: Promise<{ app?: string; ref?: string; name?: string }>;
}) {
  const { app, ref: rawRef, name: rawName } = await searchParams;
  const ref = sanitizeRef(rawRef);
  // Optional pod NAME the link can preset (e.g. /start?app=n8n&name=Acme%20automations). Light
  // sanitize only — the wizard + launchPod validate it; absent → the wizard's "my <app>" default.
  const name = rawName?.trim().replace(/\s+/g, " ").slice(0, 60) || undefined;

  const user = await getCurrentUser();
  if (!user) {
    const qp = new URLSearchParams();
    if (app) qp.set("app", app);
    if (ref) qp.set("ref", ref);
    if (name) qp.set("name", name);
    const next = `/start${qp.size ? `?${qp.toString()}` : ""}`;
    redirect(`/signin?next=${encodeURIComponent(next)}`);
  }

  // First-touch attribution: cloud growth concept only — self-host has no affiliate/attribution
  // surface (edition-parity). Set-once, never overwritten (recordFirstTouchRef).
  if (!editionOss() && ref) {
    await recordFirstTouchRef(user.id, ref);
  }

  const detail = app ? await getEnvironmentDetail(app) : null;
  if (!detail) redirect("/dashboard/create");

  // Hand off to the existing prefilled-wizard route. `from=deeplink` marks this as a deep-link
  // create so the wizard pre-generates a name and the pod's post-create moment shows the 2-card
  // walkthrough instead of the default coach-mark tour; `ref` (if any) carries through so
  // launchPod can tag THIS pod with the session's active source (may be fresher than the
  // account's first-touch ref).
  const qp = new URLSearchParams({ env: detail.name, from: "deeplink" });
  if (ref) qp.set("ref", ref);
  if (name) qp.set("name", name);
  redirect(`/dashboard/pods/new?${qp.toString()}`);
}
