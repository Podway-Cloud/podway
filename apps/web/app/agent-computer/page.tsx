import type { Metadata } from "next";
import AgentComputerLanding from "@/app/landing-agent-computer";
import LandingExperimentExposure from "@/app/landing-experiment-client";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Run Claude Code 24/7 in the cloud, from your phone",
  description:
    "Give Claude Code its own computer that never sleeps. Your session, dev server and database keep running, and you open it from the Claude app on your phone.",
  // Indexed on its own URL (owner, 2026-10-13): it was noindex + canonical "/" while it was an A/B arm.
  alternates: { canonical: "https://podway.io/agent-computer" },
};

export default async function AgentComputerPreview() {
  // A direct visit counts as an agent-computer exposure (middleware tags the visitor; see middleware.ts).
  return (
    <>
      <LandingExperimentExposure variant="agent-computer" />
      <AgentComputerLanding user={await getCurrentUser()} />
    </>
  );
}
