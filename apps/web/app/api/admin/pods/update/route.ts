import "server-only";
import { NextResponse } from "next/server";
import { getPodService } from "@/lib/pod-service";
import { createLogger } from "@podway/shared/log";

const log = createLogger("api-admin-pods-update");

/** Never burst the Incus box: recreates run one at a time, exactly like the bulk idle-update. */
const MAX_IDS = 24;

function authed(req: Request): boolean | null {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return null; // not configured
  return (req.headers.get("authorization") ?? "") === `Bearer ${expected}`;
}

/**
 * ADMIN, MACHINE-CALLABLE pod image update.
 *
 * The dashboard's per-pod Update and the bulk idle-update are Next SERVER ACTIONS — they need a
 * browser session, so nothing outside a signed-in browser could ever move a pod to a new image.
 * That left fleet migrations (e.g. finishing the podbay→podway rename, which requires every pod to
 * reach a podway-native image before the compat shims can go) with no path but manual clicking.
 *
 * Auth is the same bearer ADMIN_API_TOKEN as /api/admin/images — a machine caller, not a session.
 * The image is ALWAYS read from our env, never from the request: letting a caller name the image
 * would let them boot a pod on anything. Updates are kicked off in the BACKGROUND (the recreate
 * takes minutes) and run SEQUENTIALLY, so this returns immediately and the box is never bursted.
 */
export async function POST(req: Request): Promise<Response> {
  const ok = authed(req);
  if (ok === null) return NextResponse.json({ error: "ADMIN_API_TOKEN not configured" }, { status: 503 });
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let ids: string[] = [];
  try {
    const body = (await req.json()) as { ids?: unknown };
    if (Array.isArray(body?.ids)) ids = body.ids.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return NextResponse.json({ error: "body must be JSON: { ids: string[] }" }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ error: "ids[] required" }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `at most ${MAX_IDS} ids` }, { status: 400 });

  const image = process.env.PODWAY_BASE_IMAGE;
  if (!image) return NextResponse.json({ error: "No pod image is configured" }, { status: 503 });

  const svc = getPodService();
  // Detached + sequential. A failed pod is logged and skipped, never stalling the rest.
  void (async () => {
    for (const id of ids) {
      try {
        await svc.adminUpdatePodImage(id, image);
        log.info("admin_api_pod_updated", { podId: id });
      } catch (e) {
        log.warn("admin_api_pod_update_failed", { podId: id, err: String(e) });
      }
    }
  })();

  return NextResponse.json({ started: ids });
}
