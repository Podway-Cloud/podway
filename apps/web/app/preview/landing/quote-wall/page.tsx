import type { Metadata } from "next";
import QuoteWall from "@/components/landing-quote-wall";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Landing preview: quote wall",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://podway.io/" },
};

/**
 * Isolated preview of the "industry already agrees" quote wall so it can be reviewed before it is
 * wired into the live landing (placement: after the "what it is / how it works" section, before
 * pricing/CTA). Renders on the landing background token.
 */
export default function QuoteWallPreview() {
  return (
    <main style={{ background: "var(--background)", minHeight: "100vh" }}>
      <QuoteWall />
    </main>
  );
}
