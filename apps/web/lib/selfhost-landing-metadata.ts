import type { Metadata } from "next";

const title = "Host open-source apps with an AI admin";
const socialTitle = `Podway: ${title}`;
const description =
  "Run supported open-source apps in Podway's always-on cloud pods. Ask your AI admin in Claude for setup, backups, upgrades and help investigating problems.";

export function selfhostLandingMetadata(url: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: socialTitle,
      description,
      url,
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
      title: socialTitle,
      description,
      images: [{ url: "/twitter-image.png", alt: "Podway" }],
    },
  };
}

export function selfhostLandingStructuredData(url: string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://podway.io/#organization",
        name: "Podway",
        url: "https://podway.io/",
        description: "Persistent computers for coding agents.",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${url}#software-application`,
        name: "Podway App Hosting",
        applicationCategory: "DeveloperApplication",
        url,
        description,
        publisher: { "@id": "https://podway.io/#organization" },
      },
    ],
  };
}
