import { NextResponse, type NextRequest } from "next/server";
import { reportCrash } from "@/lib/crash-alert";

// nodejs: reportCrash uses pg (@podway/db) + the control-plane messaging, which can't run on edge.
// This route is the nodejs sink that instrumentation.ts's edge-safe onRequestError POSTs to.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Internal crash sink — only the app's own instrumentation hook calls it, guarded by a shared
 * secret so it can't be spammed from outside. Fires the Telegram alert + wakes the crash-alert pod. */
export async function POST(req: NextRequest) {
  const secret = process.env.PODWAY_CRASH_HOOK_SECRET;
  if (!secret || req.headers.get("x-crash-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as {
      message?: string;
      digest?: string;
      path?: string;
      kind?: string;
    };
    await reportCrash({
      message: body?.message,
      digest: body?.digest,
      path: body?.path,
      kind: body?.kind,
    });
  } catch {
    /* best-effort */
  }
  return new NextResponse(null, { status: 204 });
}
