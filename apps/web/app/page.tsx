import type { Metadata } from "next";
import { headers } from "next/headers";
import AgentComputerLanding from "./landing-agent-computer";
import AgentHomeLanding from "./landing-agent-home";
import LandingExperimentExposure from "./landing-experiment-client";
import OutcomesLanding from "./landing-outcomes";
import SelfhostLanding from "./selfhost/selfhost-landing";
import { redirect } from "next/navigation";
import { editionOss, getCurrentUser } from "@/lib/session";
import {
  ACTIVE_LANDING_EXPERIMENT,
  isVariantForExperiment,
  type LandingVariant,
} from "@/lib/landing-experiment-config";
import {
  getExperimentRuntimeSafe,
  isSelfhostHomepageEnabled,
} from "@/lib/landing-experiment-store";
import {
  selfhostLandingMetadata,
  selfhostLandingStructuredData,
} from "@/lib/selfhost-landing-metadata";

export const dynamic = "force-dynamic";

const landingTitle = "Podway: Give Claude a real home in the cloud";
const landingDescription =
  "A Podway pod is a private cloud VM with Claude Code, your project, and tools inside. It is always on, reachable anywhere, and uses your existing Claude subscription.";

const acquisitionMetadata: Metadata = {
  title: landingTitle,
  description: landingDescription,
  alternates: { canonical: "https://podway.io/" },
  openGraph: {
    title: landingTitle,
    description: landingDescription,
    url: "https://podway.io/",
    siteName: "Podway",
    type: "website",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Podway",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: landingTitle,
    description: landingDescription,
    images: [{ url: "/twitter-image.png", alt: "Podway" }],
  },
};

const acquisitionJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://podway.io/#organization",
      name: "Podway",
      url: "https://podway.io/",
      description: "Always-on cloud workspaces for coding agents.",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://podway.io/#software-application",
      name: "Podway",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: "https://podway.io/",
      description: landingDescription,
      publisher: { "@id": "https://podway.io/#organization" },
    },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  return (await isSelfhostHomepageEnabled())
    ? selfhostLandingMetadata("https://podway.io/")
    : acquisitionMetadata;
}

async function assignedVariant(): Promise<LandingVariant> {
  const definition = ACTIVE_LANDING_EXPERIMENT;
  const requestHeaders = await headers();
  const requested = requestHeaders.get(definition.requestHeaders.variant);
  const assigned = isVariantForExperiment(definition, requested)
    ? requested
    : definition.fallbackVariant;
  const runtime = await getExperimentRuntimeSafe();
  if (runtime.status === "stopped") {
    return runtime.pinnedVariant ?? definition.fallbackVariant;
  }
  return definition.deliveryMode === "measured" ? assigned : definition.validationVariant;
}

export default async function Home() {
  // Self-host is single-tenant with no marketing surface, so the root IS the app.
  if (editionOss()) redirect("/dashboard");
  const [selfhostHomepage, variant, user] = await Promise.all([
    isSelfhostHomepageEnabled(),
    assignedVariant(),
    getCurrentUser(),
  ]);
  if (selfhostHomepage) {
    const jsonLd = selfhostLandingStructuredData("https://podway.io/");
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />
        <SelfhostLanding user={user} />
      </>
    );
  }
  const landing = variant === "agent-home"
    ? <AgentHomeLanding user={user} />
    : variant === "agent-computer"
      ? <AgentComputerLanding user={user} />
      : <OutcomesLanding user={user} />;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(acquisitionJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <LandingExperimentExposure />
      {landing}
    </>
  );
}
