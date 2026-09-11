import { notFound } from "next/navigation";
import { requireApprovedUser } from "@/lib/access";
import { editionOss } from "@/lib/session";
import { customDomainsProvisioned } from "@/lib/custom-domain-config";
import { getPodService } from "@/lib/pod-service";
import { ControlError } from "@podway/control-plane";
import DashboardPage from "@/components/dashboard-page";
import CustomDomainWizard from "@/components/custom-domain-wizard";
import { cloudflareOAuthConfigured } from "@/lib/cloudflare-oauth";

export const dynamic = "force-dynamic";

/**
 * The custom-domain wizard page (add-custom-domains). A full page (not a modal) — reached from the
 * "Set up domain…" / "Manage" button in Settings. Cloud-only. Manage lands here with the domain
 * already loaded + editable.
 */
export default async function DomainPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireApprovedUser();
  const { slug } = await params;
  if (editionOss()) notFound(); // cloud-only feature
  // A bookmarked or guessed URL must 404 while the TLS edge is unprovisioned — the hidden Settings
  // row is presentation, not a gate.
  if (!customDomainsProvisioned()) notFound();

  let pod;
  try {
    pod = await getPodService().getPod(user.id, slug);
  } catch (e) {
    if (e instanceof ControlError && e.code === "not_found") notFound();
    throw e;
  }
  const name = pod.name?.trim() || slug;

  return (
    <DashboardPage backHref={`/dashboard/pods/${slug}?tab=settings`} backLabel={name} title="Custom domain">
      <CustomDomainWizard slug={slug} cloudflareEnabled={cloudflareOAuthConfigured()} />
    </DashboardPage>
  );
}
