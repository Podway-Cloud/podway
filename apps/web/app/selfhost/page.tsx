import { redirect } from "next/navigation";
import SelfhostLanding from "./selfhost-landing";
import { editionOss, getCurrentUser } from "@/lib/session";
import {
  selfhostLandingMetadata,
  selfhostLandingStructuredData,
} from "@/lib/selfhost-landing-metadata";

export const dynamic = "force-dynamic";

export const metadata = selfhostLandingMetadata("https://podway.io/selfhost");

export default async function SelfhostPage() {
  if (editionOss()) redirect("/dashboard");
  const user = await getCurrentUser();
  const jsonLd = selfhostLandingStructuredData("https://podway.io/selfhost");
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
