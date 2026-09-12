"use server";

// NOTE: a "use server" file may export ONLY async functions. Do NOT add consts/types/sync
// helpers here — that breaks `next build` (we hit exactly this on #283). Shared consts/types
// belong in a plain module (e.g. landing-experiment-config.ts / landing-experiment-store.ts).

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./access";
import { setPinnedDefault, setRunningStatus } from "./landing-experiment-store";
import {
  ACTIVE_LANDING_EXPERIMENT,
  isMutableLandingDefinition,
} from "./landing-experiment-config";

/** Revalidate every surface whose output depends on the run state. */
function revalidateExperimentSurfaces(): void {
  revalidatePath("/admin/experiments");
  revalidatePath(`/admin/experiments/${ACTIVE_LANDING_EXPERIMENT.id}`);
  revalidatePath("/");
}

function assertMutableActive(): string {
  if (!isMutableLandingDefinition(ACTIVE_LANDING_EXPERIMENT.id)) {
    throw new Error("The active landing experiment is read-only");
  }
  return ACTIVE_LANDING_EXPERIMENT.id;
}

/** Pin a landing as the default served at `/` (does not change the running status). */
export async function setDefaultLanding(variant: string): Promise<void> {
  const admin = await requireAdmin();
  const experimentId = assertMutableActive();
  await setPinnedDefault(admin.id, variant, experimentId);
  revalidateExperimentSurfaces();
}

/** Turn the running experiment on or off (keeps the current default). */
export async function setExperimentRunning(running: boolean): Promise<void> {
  const admin = await requireAdmin();
  const experimentId = assertMutableActive();
  await setRunningStatus(admin.id, running, experimentId);
  revalidateExperimentSurfaces();
}

/** Stop the running experiment; the current default keeps serving `/`. */
export async function stopExperiment(): Promise<void> {
  const admin = await requireAdmin();
  const experimentId = assertMutableActive();
  await setRunningStatus(admin.id, false, experimentId);
  revalidateExperimentSurfaces();
}

/** Promote a winner: pin it as the default AND stop the experiment, in one action. */
export async function promoteWinner(variant: string): Promise<void> {
  const admin = await requireAdmin();
  const experimentId = assertMutableActive();
  await setPinnedDefault(admin.id, variant, experimentId);
  await setRunningStatus(admin.id, false, experimentId);
  revalidateExperimentSurfaces();
}
