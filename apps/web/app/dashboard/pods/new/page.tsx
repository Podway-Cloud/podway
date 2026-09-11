import { redirect } from "next/navigation";
import { requireApprovedUser } from "@/lib/access";
import { getEnvironmentDetail } from "@/lib/environments";
import { getPodService, isProvisioningEnabled, hostCapacity } from "@/lib/pod-service";
import LaunchConfigure from "@/components/launch-configure";
import DashboardPage from "@/components/dashboard-page";
import HideSupportChat from "@/components/hide-support-chat";
import { isAdmin } from "@/lib/access-rules";
import { editionOss } from "@/lib/session";
import { harnessEnabled } from "@/lib/agent-harness";
import { getBillingSummary } from "@/lib/billing-actions";
import { ACCOUNT_RAM_GB } from "@podway/shared/tiers";
import { sanitizeRef } from "@podway/shared";

export const dynamic = "force-dynamic";

/**
 * Step 1 of the launch flow: configure. On Create it navigates to the pod's
 * durable setup page (/dashboard/pods/<slug>), where every step is a reflection
 * of DB state (docs/runbooks/pod-launch-wizard-plan.md). Reached from a catalog tile with
 * ?env=<name>.
 */
export const metadata = { title: "New pod" };

export default async function NewPodPage({
  searchParams,
}: {
  searchParams: Promise<{ env?: string; step?: string; from?: string; ref?: string; name?: string }>;
}) {
  const user = await requireApprovedUser();
  const { env, step, from, ref: rawRef, name: rawName } = await searchParams;
  if (!env) redirect("/dashboard/create");
  const detail = await getEnvironmentDetail(env);
  if (!detail) redirect("/dashboard/create");
  // Deep-link create (deeplink-onboarding, /start): pre-generate a pod name so the wizard opens
  // fully prefilled — the user's only remaining decision is to confirm (Create is never
  // auto-submitted). `ref` is the attribution source active for THIS launch, carried through to
  // launchPod; re-sanitized here since it arrived over a URL.
  const deeplink = from === "deeplink";
  // Friendly, app-based default the user recognises ("my n8n"), not a random slug — and the
  // wizard focuses + selects it so they can just type a new name. The durable pod slug is still
  // generated server-side at create; this is only the display name.
  // Deep link may preset a pod name (?name=…); otherwise the friendly "my <app>" default. Light
  // sanitize (trim/collapse-whitespace/cap) — the wizard + launchPod validate on submit.
  const presetName = rawName?.trim().replace(/\s+/g, " ").slice(0, 60);
  const initialName = deeplink ? (presetName || `my ${detail.title}`) : undefined;
  const ref = sanitizeRef(rawRef);
  // The account's RAM budget (GB), so the wizard can show the cost + free memory and block a
  // launch that won't fit BEFORE the user fills everything in. Admins are unbounded.
  const ram = await getPodService().accountRamUsage(user.id, ACCOUNT_RAM_GB);
  // Self-host: the real Docker host's CPU/RAM + what running pods have reserved, so the
  // size step can show free capacity instead of cloud tiers. null in cloud (unused there).
  const oss = editionOss();
  const capacity = oss ? await hostCapacity() : null;
  // Cloud cost-at-create (billing-ux): show the chosen size's price against the owner's free credit
  // on the Review step. `getBillingSummary()` is null when billing is off — then the wizard shows the
  // advertised signup-credit figure and no card prompt. Self-host has no per-pod price.
  const billing = oss ? null : await getBillingSummary();

  return (
    <DashboardPage
      backHref="/dashboard/create"
      backLabel="Create a pod"
      title={`New pod — ${detail.title}`}
    >
      {/* On a phone the fixed support launcher sits on top of the wizard's sticky Next/Create
          button; hide it on small screens only (desktop keeps it). */}
      <HideSupportChat mobileOnly />
      <LaunchConfigure
        env={detail.name}
        secrets={detail.secrets}
        byoRepo={detail.byoRepo}
        agentIds={detail.agentIds}
        enabled={isProvisioningEnabled()}
        initialStep={step}
        ram={{ used: ram.usedGb, cap: ACCOUNT_RAM_GB, unlimited: isAdmin(user.email) || oss }}
        oss={oss}
        t3Enabled={harnessEnabled("t3")}
        capacity={capacity}
        initialName={initialName}
        deeplink={deeplink}
        refSource={ref ?? undefined}
        billingEnabled={billing !== null}
        creditCents={billing?.creditCents ?? 0}
        hasCard={billing?.hasCard ?? false}
      />
    </DashboardPage>
  );
}
