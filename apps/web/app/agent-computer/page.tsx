import type { Metadata } from "next";
import AgentComputerLanding from "@/app/landing-agent-computer";
import LandingExperimentExposure from "@/app/landing-experiment-client";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "An always-on computer for your AI agent",
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
