import { afterEach, describe, expect, it, vi } from "vitest";
import { writeCustomDomainRecords } from "@/lib/cloudflare-dns";

/**
 * The Cloudflare DNS write client. We fake `fetch` and assert: zone resolve (hit/miss/co.uk),
 * upsert (create vs update), CNAME written DNS-only (proxied:false), a 403 → typed `scope` error, and
 * that the bearer token never appears in any returned error message.
 */

const TOKEN = "cf-secret-token-do-not-leak";
const CNAME = { type: "CNAME", name: "app.acme.com", value: "cname.podway.cloud" };
const TXT = { type: "TXT", name: "_podway-challenge.app.acme.com", value: "podway-verify=abc123" };

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown };

function mockFetch(handler: Handler) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const { status = 200, body } = handler(url, init);
      return { status, ok: status < 400, json: async () => body } as unknown as Response;
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("writeCustomDomainRecords", () => {
  it("resolves the zone, creates both records, and writes the CNAME DNS-only", async () => {
    const calls = mockFetch((url, init) => {
      if (url.includes("/zones?name=")) {
        // Only acme.com is a real zone; the 3-label candidate misses.
        return url.includes("name=acme.com")
          ? { body: { success: true, result: [{ id: "zone1", name: "acme.com" }] } }
          : { body: { success: true, result: [] } };
      }
      if (init?.method === "PUT" || init?.method === "POST") return { body: { success: true, result: { id: "rec" } } };
      return { body: { success: true, result: [] } }; // list-by-name → none exist yet
    });

    const r = await writeCustomDomainRecords(TOKEN, "app.acme.com", [CNAME, TXT]);
    expect(r).toEqual({ ok: true, zone: "acme.com", written: 2 });

    const writes = calls.filter((c) => c.init?.method === "POST" || c.init?.method === "PUT");
    expect(writes).toHaveLength(2);
    const cnameBody = JSON.parse(writes.find((w) => String(w.init?.body).includes("CNAME"))!.init!.body as string);
    expect(cnameBody.proxied).toBe(false); // critical: a proxied CNAME breaks HTTPS issuance
    const txtBody = JSON.parse(writes.find((w) => String(w.init?.body).includes("TXT"))!.init!.body as string);
    expect(txtBody).not.toHaveProperty("proxied"); // proxied is meaningless for TXT
  });

  it("updates an existing record in place (PUT, not a duplicate POST)", async () => {
    const calls = mockFetch((url, init) => {
      if (url.includes("/zones?name=")) {
        return url.includes("name=acme.com")
          ? { body: { success: true, result: [{ id: "zone1", name: "acme.com" }] } }
          : { body: { success: true, result: [] } };
      }
      if (init?.method === "PUT") return { body: { success: true, result: { id: "rec1" } } };
      // list-by-name → the CNAME already exists.
      return { body: { success: true, result: [{ id: "rec1" }] } };
    });

    const r = await writeCustomDomainRecords(TOKEN, "app.acme.com", [CNAME]);
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.init?.method === "PUT" && c.url.includes("/dns_records/rec1"))).toBe(true);
    expect(calls.some((c) => c.init?.method === "POST")).toBe(false);
  });

  it("resolves a multi-label (co.uk) zone via the longer suffix candidate", async () => {
    mockFetch((url, init) => {
      if (url.includes("/zones?name=")) {
        return url.includes("name=acme.co.uk")
          ? { body: { success: true, result: [{ id: "z", name: "acme.co.uk" }] } }
          : { body: { success: true, result: [] } };
      }
      if (init?.method === "POST" || init?.method === "PUT") return { body: { success: true, result: { id: "r" } } };
      return { body: { success: true, result: [] } };
    });
    const r = await writeCustomDomainRecords(TOKEN, "app.acme.co.uk", [
      { type: "CNAME", name: "app.acme.co.uk", value: "cname.podway.cloud" },
    ]);
    expect(r).toMatchObject({ ok: true, zone: "acme.co.uk" });
  });

  it("returns not_on_cloudflare when no zone matches (domain not on this account)", async () => {
    mockFetch((url) => {
      if (url.includes("/zones?name=")) return { body: { success: true, result: [] } };
      return { body: { success: true, result: [] } };
    });
    const r = await writeCustomDomainRecords(TOKEN, "app.acme.com", [CNAME]);
    expect(r).toEqual({ ok: false, reason: "not_on_cloudflare", message: expect.stringContaining("acme.com") });
  });

  it("maps a 403 on zone lookup to a scope error", async () => {
    mockFetch((url) => {
      if (url.includes("/zones?name="))
        return { status: 403, body: { success: false, errors: [{ code: 9109, message: "Unauthorized" }] } };
      return { body: { success: true, result: [] } };
    });
    const r = await writeCustomDomainRecords(TOKEN, "app.acme.com", [CNAME]);
    expect(r).toMatchObject({ ok: false, reason: "scope" });
  });

  it("never leaks the bearer token in an error message", async () => {
    mockFetch((url, init) => {
      if (url.includes("/zones?name="))
        return url.includes("name=acme.com")
          ? { body: { success: true, result: [{ id: "z", name: "acme.com" }] } }
          : { body: { success: true, result: [] } };
      if (init?.method === "POST") return { status: 400, body: { success: false, errors: [{ message: "bad record" }] } };
      return { body: { success: true, result: [] } };
    });
    const r = await writeCustomDomainRecords(TOKEN, "app.acme.com", [CNAME]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toContain(TOKEN);
  });
});
