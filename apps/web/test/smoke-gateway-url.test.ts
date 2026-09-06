import { describe, it, expect, afterEach } from "vitest";
import { GET } from "@/app/api/smoke/gateway-url/route";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

/**
 * The endpoint the deploy smoke check probes. It exists because the web terminal was dead in
 * production while every test passed: e2e injects its own gateway URL, so a wrong PROD value is
 * invisible to it. These pin the shape the smoke script parses.
 */
describe("/api/smoke/gateway-url", () => {
  it("reports the URL the app hands to browsers", async () => {
    process.env.NEXT_PUBLIC_GATEWAY_URL = "wss://gw.example.test";
    expect(await (await GET()).json()).toEqual({ gatewayUrl: "wss://gw.example.test" });
  });

  it("reports 'auto' for same-origin self-host, which the smoke check skips probing", async () => {
    delete process.env.NEXT_PUBLIC_GATEWAY_URL;
    process.env.PODWAY_GATEWAY_SAMEORIGIN = "1";
    expect(await (await GET()).json()).toEqual({ gatewayUrl: "auto" });
  });

  it("reports empty when nothing is configured", async () => {
    delete process.env.NEXT_PUBLIC_GATEWAY_URL;
    delete process.env.PODWAY_GATEWAY_SAMEORIGIN;
    expect(await (await GET()).json()).toEqual({ gatewayUrl: "" });
  });

  it("returns ONLY the gateway url — this must never grow into a config dump", async () => {
    process.env.NEXT_PUBLIC_GATEWAY_URL = "wss://gw.example.test";
    process.env.ADMIN_API_TOKEN = "must-not-appear";
    const body = await (await GET()).json();
    expect(Object.keys(body)).toEqual(["gatewayUrl"]);
    expect(JSON.stringify(body)).not.toContain("must-not-appear");
  });
});
