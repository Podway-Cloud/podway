import { notFound } from "next/navigation";
import DashboardPage from "@/components/dashboard-page";
import ExperimentsPanel from "@/components/experiments-panel";
import { editionOss } from "@/lib/session";
import { ACTIVE_LANDING_EXPERIMENT } from "@/lib/landing-experiment-config";
import { getHomepageTraffic } from "@/lib/homepage-traffic";
import { getTrafficChangeLog, getTrafficResults } from "@/lib/homepage-traffic-report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Experiments" };

export default async function ExperimentsPage() {
  // Cloud-only operator surface — self-host has no marketing landing to experiment on.
  if (editionOss()) notFound();
  // The control is a two-landing split (slider = the second landing's share).
  if (ACTIVE_LANDING_EXPERIMENT.variants.length !== 2) notFound();
  const [traffic, results, log] = await Promise.all([
    getHomepageTraffic(),
    getTrafficResults(),
    getTrafficChangeLog(),
  ]);
  return (
    <DashboardPage
      title="Homepage landing"
      intro="What visitors see at podway.io, and how each landing converts."
      wide
    >
      <ExperimentsPanel definition={ACTIVE_LANDING_EXPERIMENT} traffic={traffic} results={results} log={log} />
    </DashboardPage>
  );
}
