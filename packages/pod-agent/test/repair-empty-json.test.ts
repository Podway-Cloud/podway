import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { repairEmptyJsonFile } from "../src/signals.js";

/** GTM, 2026-09-25: a disk-full event left ~/.codex/app-server-daemon/settings.json EMPTY; the Codex
 * RC daemon then failed to parse it on every start, forever ("EOF while parsing"). */
describe("repairEmptyJsonFile", () => {
  const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "pbjson-"));
  it("rewrites an EMPTY file with the fallback and keeps the empty one aside", () => {
    const p = path.join(dir(), "settings.json");
    fs.writeFileSync(p, "");
    expect(repairEmptyJsonFile(p, '{"a":1}\n')).toBe(true);
    expect(fs.readFileSync(p, "utf8")).toBe('{"a":1}\n');
    expect(fs.existsSync(`${p}.empty-bak`)).toBe(true);
  });
  it("never touches a non-empty or missing file", () => {
    const p = path.join(dir(), "settings.json");
    expect(repairEmptyJsonFile(p, "{}")).toBe(false);
    expect(fs.existsSync(p)).toBe(false);
    fs.writeFileSync(p, '{"mine":true}');
    expect(repairEmptyJsonFile(p, "{}")).toBe(false);
    expect(fs.readFileSync(p, "utf8")).toBe('{"mine":true}');
  });
});
