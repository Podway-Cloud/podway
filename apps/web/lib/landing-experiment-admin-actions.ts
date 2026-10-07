"use server";

// NOTE: a "use server" file may export ONLY async functions. Do NOT add consts/types/sync
// helpers here — that breaks `next build` (we hit exactly this on #283). Shared consts/types
// belong in a plain module (e.g. landing-experiment-config.ts / homepage-traffic.ts).

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./access";
import { applyHomepageTraffic, type TrafficChange } from "./homepage-traffic";

/** The ONE homepage control: a split (percent per landing) or one landing for everyone. Admin-only;
 * atomic with its audit row; every saved split starts a new results period. */
export async function saveHomepageTraffic(change: TrafficChange): Promise<void> {
  const admin = await requireAdmin();
  await applyHomepageTraffic(admin.id, change);
  revalidatePath("/admin/experiments");
  revalidatePath("/");
}
