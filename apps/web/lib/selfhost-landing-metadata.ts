import type { Metadata } from "next";

const title = "Self-host without becoming the sysadmin";
const socialTitle = `Podway — ${title}`;
const description =
  "Self-host supported open-source tools with an AI admin you work with through the official Claude apps.";

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
        name: "Podway Self-host",
        applicationCategory: "DeveloperApplication",
        url,
        description,
        publisher: { "@id": "https://podway.io/#organization" },
      },
    ],
  };
}
