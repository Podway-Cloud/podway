import { describe, it, expect } from "vitest";
import { scrub, buildReport, ReportLimiter, REPORT_MAX_BYTES } from "../src/bug-report.js";

describe("scrub — no secret survives", () => {
  const secrets = ["s3cr3t-telegram-token-123456", "hunter2hunter2"];
  it("removes every pod secret value", () => {
    const out = scrub(`token=s3cr3t-telegram-token-123456 pw hunter2hunter2 ok`, secrets);
    for (const s of secrets) expect(out).not.toContain(s);
    expect(out).toContain("[redacted]");
    expect(out).toContain("ok");
  });
  it("removes token SHAPES even when they are not a declared secret", () => {
    const fake = [
      "sk-ant-api03-" + "A".repeat(40),
      "ghp_" + "b".repeat(36),
      "gho_" + "c".repeat(36),
      "xoxb-1234-5678-" + "d".repeat(20),
      "AKIA" + "E".repeat(16),
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0." + "f".repeat(30),
      "--token " + "g".repeat(40),
      "Authorization: Bearer " + "h".repeat(30),
    ];
    const out = scrub(fake.join("\n"), []);
    for (const f of fake) expect(out, f).not.toContain(f.slice(-20));
  });
  it("ignores empty / tiny 'secrets' (would shred the text)", () => {
    expect(scrub("a b c", ["", "a"])).toBe("a b c");
  });
});

describe("buildReport", () => {
  it("scrubs the bundle, caps its size, and keeps summary + area", () => {
    const r = buildReport(
      { summary: "startup entry prod-tunnel not running", area: "startup", source: "agent" },
      { health: '{"token":"hunter2hunter2"}', logs: "x".repeat(200_000), doctor: "ok", startup: "NOT RUNNING prod-tunnel" },
      ["hunter2hunter2"],
      "2026-09-25T12:00:00Z",
    );
    expect(r.summary).toBe("startup entry prod-tunnel not running");
    expect(r.area).toBe("startup");
    expect(JSON.stringify(r)).not.toContain("hunter2hunter2");
    expect(Buffer.byteLength(JSON.stringify(r))).toBeLessThanOrEqual(REPORT_MAX_BYTES);
    expect(r.bundle.startup).toContain("NOT RUNNING");
  });
  it("an unknown area becomes 'other'", () => {
    expect(buildReport({ summary: "x", area: "bogus", source: "agent" }, {}, [], "t").area).toBe("other");
  });
});

describe("ReportLimiter — 5 per pod per hour", () => {
  it("allows 5 in an hour, then refuses until the window moves", () => {
    const l = new ReportLimiter(5, 3_600_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(l.allow(t0 + i)).toBe(true);
    expect(l.allow(t0 + 10)).toBe(false);
    expect(l.allow(t0 + 3_600_001)).toBe(true);
  });
});

import { secretValuesFrom } from "../src/bug-report.js";
describe("secretValuesFrom", () => {
  it("reads values from a secrets env file", () => {
    expect(secretValuesFrom("A=one\nexport B='two words'\nC=\"three\"\n# x\nD=\n")).toEqual(["one", "two words", "three"]);
  });
});
