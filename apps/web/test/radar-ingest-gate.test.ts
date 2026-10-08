import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/** The radar ingest is a public URL that writes to the DB: only the RADAR_INGEST_TOKEN bearer may post. */
const saveRadarFeed = vi.fn();
vi.mock("@/lib/session", () => ({ editionOss: () => false }));
vi.mock("@/lib/radar", async (orig) => ({ ...(await orig<typeof import("@/lib/radar")>()), saveRadarFeed: (...a: unknown[]) => saveRadarFeed(...a) }));
const { POST } = await import("@/app/api/radar/ingest/route");

const TOKEN = "t".repeat(40);
const feed = JSON.stringify({ updated: "2026-10-07", items: [{
  app: "Umami", slug: "umami", repo: "umami-software/umami", issue_url: "https://github.com/umami-software/umami/issues/1",
  issue_number: 1, title: "broke", what_broke: "broke", opened: "2026-10-06", state: "open" }] });
const post = (body: string, auth?: string) =>
  POST(new NextRequest("https://podway.io/api/radar/ingest", { method: "POST", body, headers: auth ? { authorization: auth } : {} }));

beforeEach(() => { saveRadarFeed.mockReset(); vi.stubEnv("RADAR_INGEST_TOKEN", TOKEN); });
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/radar/ingest", () => {
  it("refuses a missing or wrong token and writes nothing", async () => {
    expect((await post(feed)).status).toBe(401);
    expect((await post(feed, `Bearer ${"x".repeat(40)}`)).status).toBe(401);
    expect(saveRadarFeed).not.toHaveBeenCalled();
  });

  it("is OFF when no (or a short) token is configured", async () => {
    vi.stubEnv("RADAR_INGEST_TOKEN", "short");
    expect((await post(feed, "Bearer short")).status).toBe(401);
    expect(saveRadarFeed).not.toHaveBeenCalled();
  });

  it("rejects an invalid feed, and stores a valid one", async () => {
    expect((await post("{not json", `Bearer ${TOKEN}`)).status).toBe(400);
    expect((await post(JSON.stringify({ items: [] }), `Bearer ${TOKEN}`)).status).toBe(400);
    const ok = await post(feed, `Bearer ${TOKEN}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, accepted: 1, dropped: 0 });
    expect(saveRadarFeed).toHaveBeenCalledTimes(1);
  });

  it("names why each dropped item was dropped", async () => {
    const two = JSON.parse(feed);
    two.items.push({ ...two.items[0], slug: "umami", opened: "2026-10-06T10:00:00Z", issue_number: "1" });
    const res = await (await post(JSON.stringify(two), `Bearer ${TOKEN}`)).json();
    expect(res).toMatchObject({ accepted: 1, dropped: 1, reasons: ["item 1 (umami): bad issueNumber, opened"] });
  });
});
