import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy launch route. The "Create a pod" catalog now lives in-shell at
 * /dashboard/create; redirect (preserving any ?env= preselection) so old
 * links, the landing CTA, and shareable env URLs keep working.
 */
export default async function NewPod({
  searchParams,
}: {
  searchParams: Promise<{ env?: string }>;
}) {
  const { env } = await searchParams;
  redirect(`/dashboard/create${env ? `?env=${encodeURIComponent(env)}` : ""}`);
}
