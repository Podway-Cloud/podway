import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ConsentBanner from "@/components/consent-banner";
import { editionOss } from "@/lib/session";
import GoogleAnalytics from "@/components/google-analytics";
import { QueryProvider } from "@/app/providers";
import ThemeProvider from "@/components/theme-provider";

// Self-hosted by next/font (no external request, no layout shift). Exposed as
// the --font-inter CSS var that --font-ui builds on (see globals.css).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://podway.io"),
  // A template so every page reads "<Page> · Podway" in the tab / app switcher; the
  // default (marketing title) stands only where a page sets none (e.g. the landing,
  // which also sets its own).
  title: {
    default: "Podway: a persistent home for your coding agents",
    template: "%s · Podway",
  },
  description:
    "Give Claude Code a persistent cloud workspace with your project, tools, services, and automation. It is available from the official Claude apps.",
  openGraph: {
    title: "Podway: a persistent home for your coding agents",
    description:
      "A persistent cloud workspace for Claude Code, available from the official Claude apps on desktop and mobile.",
    url: "https://podway.io",
    siteName: "Podway",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1220",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Structured data: who we are (Organization) + what we are (SoftwareApplication), for rich
  // results. Sitewide because both describe the product, not one page. Copy stays truthful.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://podway.cloud/#org",
        name: "Podway",
        url: "https://podway.io",
        description: "Always-on cloud workspaces for coding agents.",
      },
      {
        "@type": "SoftwareApplication",
        name: "Podway",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: "https://podway.io",
        description:
          "Give Claude Code a persistent cloud workspace with your project, tools, services, and automation, available from the official Claude apps.",
        publisher: { "@id": "https://podway.cloud/#org" },
      },
    ],
  };

  // A self-host (OSS) install is a private single-tenant box, not the podway.cloud product, so it must
  // not emit podway.cloud marketing structured data, cookie consent, or analytics.
  const oss = editionOss();
  return (
    // suppressHydrationWarning: next-themes sets data-theme on <html> before React
    // hydrates, so the server/client attribute differ by design — this silences the
    // expected mismatch warning (it does NOT hide real ones on descendants).
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        {!oss && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
        )}
        {/* React Query lives at the ROOT so EVERY route tree that renders a react-query component has
            a client, not just /dashboard. The cockpit at /pods/[slug] has no layout of its own and
            inherits only this root, so scoping the provider to the dashboard layout crashed the cockpit
            with "No QueryClient set" (2026-08-23). App-wide is the correct scope. */}
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
        {/* Cookie consent + analytics are cloud-only. A single-tenant self-host install sets no
            third-party cookies and ships no analytics, so there's nothing to consent to. */}
        {!oss && (
          <>
            <ConsentBanner />
            <GoogleAnalytics />
          </>
        )}
      </body>
    </html>
  );
}
