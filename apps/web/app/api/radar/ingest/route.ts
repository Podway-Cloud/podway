import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { editionOss } from "@/lib/session";
import { parseRadarFeed, saveRadarFeed } from "@/lib/radar";

const MAX_BYTES = 1_000_000;

/** Constant-time bearer check against RADAR_INGEST_TOKEN; unset token = endpoint off. */
function authorized(req: NextRequest): boolean {
  const want = process.env.RADAR_INGEST_TOKEN ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (want.length < 32 || got.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** The GTM pod posts its daily radar-public.json here (owner decision 2026-10-07: a private ingest, no
 * public repo). Cloud only. Strictly validated before storing — /radar and /apps render it. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (editionOss()) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "too large" }, { status: 413 });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const feed = parseRadarFeed(raw);
  if (!feed) return NextResponse.json({ error: "invalid feed: need updated (YYYY-MM-DD) and items[] (≤500)" }, { status: 400 });
  await saveRadarFeed(feed);
  const sent = Array.isArray((raw as { items?: unknown[] }).items) ? (raw as { items: unknown[] }).items.length : 0;
  return NextResponse.json({ ok: true, accepted: feed.items.length, dropped: sent - feed.items.length });
}
