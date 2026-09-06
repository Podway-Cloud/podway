import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Legacy in-shell path. The "Create a pod" catalog moved to /dashboard/create
 * (renamed from "Environments"). Redirect so existing bookmarks keep working.
 */
export default function EnvironmentsRedirect() {
  redirect("/dashboard/create");
}
