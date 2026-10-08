import { describe, it, expect } from "vitest";
import { appMatches } from "../lib/app-search";

const n8n = { title: "n8n", name: "n8n", oneLiner: "Connect your tools and automate recurring work.", replaces: "Zapier" };
const paperless = { title: "Paperless-ngx", name: "paperless-ngx", oneLiner: "Scan, tag and search your paper documents.", replaces: "Evernote" };

describe("/apps quick search", () => {
  it("matches name, what it does, and what it replaces — any case, every word", () => {
    expect(appMatches(n8n, "")).toBe(true);
    expect(appMatches(n8n, "Zapier")).toBe(true);
    expect(appMatches(n8n, "automate tools")).toBe(true);
    expect(appMatches(paperless, "scan documents")).toBe(true);
  });
  it("forgives typos in the title (in-order letters)", () => {
    expect(appMatches(n8n, "nn")).toBe(true);
    expect(appMatches(paperless, "pperless")).toBe(true);
  });
  it("rejects what does not match", () => {
    expect(appMatches(n8n, "analytics")).toBe(false);
    expect(appMatches(paperless, "zapier scan")).toBe(false);
  });
});
