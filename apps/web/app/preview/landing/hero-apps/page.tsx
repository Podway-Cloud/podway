import type { Metadata } from "next";
import SelfhostLanding from "@/app/selfhost/selfhost-landing";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Landing preview: hero-apps",
  robots: { index: false, follow: false },
  alternates: { canonical: "https://podway.io/" },
};

export default async function HeroPreview() {
  return <SelfhostLanding user={await getCurrentUser()} hero="apps" />;
}
