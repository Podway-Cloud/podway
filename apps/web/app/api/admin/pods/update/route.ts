import "server-only";
import { NextResponse } from "next/server";
import { getPodService } from "@/lib/pod-service";
import { createLogger } from "@podway/shared/log";
import { normalizeUpdateIds } from "@/lib/admin-update-ids";

const log = createLogger("api-admin-pods-update");

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

  let rawIds: unknown;
  try {
    const body = (await req.json()) as { ids?: unknown };
    rawIds = body?.ids;
  } catch {
    return NextResponse.json({ error: "body must be JSON: { ids: string[] }" }, { status: 400 });
  }
  // A whole fleet is accepted in one call now — no more rejecting >24. The box is protected by the
  // SEQUENTIAL recreate loop below + admission.ts, not by a request-size cap (see admin-update-ids.ts).
  const norm = normalizeUpdateIds(rawIds);
  if ("error" in norm) return NextResponse.json({ error: norm.error }, { status: norm.status });
  const ids = norm.ids;

  const image = process.env.PODWAY_BASE_IMAGE;
  if (!image) return NextResponse.json({ error: "No pod image is configured" }, { status: 503 });

  const svc = getPodService();
  // Mark the WHOLE batch queued before any of it starts, so a pod that is 20 recreates away says so
  // instead of still offering "Update available" — and so its cockpit can refuse rather than let an
  // owner start an edit the update is about to interrupt. Durable on the row, so a web restart
  // mid-batch leaves a visible, resumable queue instead of silently stranding the remainder.
  await svc.markUpdateQueue(ids);

  // Detached + sequential. A failed pod is logged and skipped, never stalling the rest.
  void (async () => {
    const remaining = new Set(ids);
    try {
      for (const id of ids) {
        try {
          await svc.adminUpdatePodImage(id, image);
          log.info("admin_api_pod_updated", { podId: id });
        } catch (e) {
          log.warn("admin_api_pod_update_failed", { podId: id, err: String(e) });
        } finally {
          // Reached either way: a pod whose update FAILED must not stay flagged as still-waiting.
          remaining.delete(id);
        }
      }
    } finally {
      // Anything the loop never reached must not stay locked out of its own cockpit. A stale queue
      // flag is a worse failure than the interruption it exists to prevent, so clear on every path.
      if (remaining.size) await svc.clearUpdateQueue([...remaining]).catch(() => undefined);
    }
  })();

  return NextResponse.json({ started: ids });
}
