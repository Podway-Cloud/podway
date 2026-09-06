import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWithConfig } from "@podway/shared";
import { buildInitFiles, toEnvFile } from "../src/pod-init.js";

/**
 * Pod init-file assembly. This used to live in fly-provider.test.ts and moved here when the dead Fly
 * provider was deleted (2026-09-04) — the code it covers was never Fly-specific: the Incus and Local
 * providers both build their guest files with it, so this is the coverage that had to survive.
 */
const exampleDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "environments",
  "nextjs-starter",
);

async function makePod() {
  const resolved = await resolveWithConfig(exampleDir);
  return { resolved, envDir: exampleDir };
}

describe("app-secret file", () => {
  it("toEnvFile shell-quotes values so the file is safe to source", () => {
    const out = toEnvFile({ B: "two", A: "it's \"quoted\"" });
    // deterministic key order, single-quoted, embedded quote escaped `'\''`
    expect(out).toBe("A='it'\\''s \"quoted\"'\nB='two'\n");
  });
});

describe("buildInitFiles", () => {
  it("carries no credential fields and is sorted/deterministic", async () => {
    const { resolved, envDir } = await makePod();
    const a = await buildInitFiles({ id: "x", resolved, envDir });
    const b = await buildInitFiles({ id: "x", resolved, envDir });
    expect(a.map((f) => f.guest_path)).toEqual(b.map((f) => f.guest_path));
    const sorted = [...a].sort((p, q) => p.guest_path.localeCompare(q.guest_path));
    expect(a).toEqual(sorted);
  });

  // Owner report, 2026-08-27: an agent handed over "Open your pod dashboard:
  // https://podway.cloud/pods/<slug> → Settings → Secrets" and it landed on the web TERMINAL.
  // `/pods/<slug>` renders PodTerminalLoader; the cockpit (with the secrets/settings/stats tabs)
  // is `/dashboard/pods/<slug>`. This one builder feeds Fly AND Incus, so the wrong URL was baked
  // into every pod's spec — confirmed by reading a live pod's /etc/podway/pod-spec.json.
  it("writes the COCKPIT url (/dashboard/pods/…), never the bare terminal url (/pods/…)", async () => {
    const { resolved, envDir } = await makePod();
    // appOrigin is derived from PODWAY_PREVIEW_BASE (preview.podway.cloud → podway.cloud).
    const prev = process.env.PODWAY_PREVIEW_BASE;
    process.env.PODWAY_PREVIEW_BASE = "preview.podway.cloud";
    try {
      const files = await buildInitFiles({ id: "partial-canidae-a766", resolved, envDir });
      const f = files.find((x) => x.guest_path === "/etc/podway/pod-spec.json")!;
      const spec = JSON.parse(Buffer.from(f.raw_value, "base64").toString());
      expect(spec.cockpitUrl).toBe("https://podway.cloud/dashboard/pods/partial-canidae-a766");
      // Guard the exact regression: the slug must not be preceded by a bare /pods/.
      expect(spec.cockpitUrl).not.toMatch(/\.cloud\/pods\//);
    } finally {
      if (prev === undefined) delete process.env.PODWAY_PREVIEW_BASE;
      else process.env.PODWAY_PREVIEW_BASE = prev;
    }
  });

  it("carries the user's display name as podName (null when unnamed)", async () => {
    const { resolved, envDir } = await makePod();
    const readSpec = async (name?: string) => {
      const files = await buildInitFiles({ id: "x", resolved, envDir, name });
      const f = files.find((x) => x.guest_path === "/etc/podway/pod-spec.json")!;
      return JSON.parse(Buffer.from(f.raw_value, "base64").toString());
    };
    expect((await readSpec("Test 3")).podName).toBe("Test 3");
    expect((await readSpec("  ")).podName).toBeNull();
    expect((await readSpec()).podName).toBeNull();
  });

  it("injects the SHARED .claude base layer (environments/_shared) into every pod", async () => {
    const { resolved, envDir } = await makePod();
    const files = await buildInitFiles({ id: "x", resolved, envDir });
    const paths = files.map((f) => f.guest_path);
    // The shared mobile-viewport skill lands in the pod's ~/.claude alongside the
    // env's own layer — no per-env duplication.
    expect(paths).toContain(
      "/etc/podway/claude/skills/mobile-keyboard-viewport/SKILL.md",
    );
    // And the env's own layer still ships alongside it.
    expect(paths).toContain("/etc/podway/claude/skills/ship-feature/SKILL.md");
  });

  it("the pod's chosen agent overrides the env default in the spec (slice 3)", async () => {
    const { resolved, envDir } = await makePod();
    const readSpecAgents = async (agents?: string[]) => {
      const files = await buildInitFiles({
        id: "x",
        resolved,
        envDir,
        agents: agents as never,
      });
      const f = files.find((x) => x.guest_path === "/etc/podway/pod-spec.json")!;
      return JSON.parse(Buffer.from(f.raw_value, "base64").toString()).agents;
    };
    // No override → the env's declared agents (nextjs-starter defaults to claude-code).
    expect(await readSpecAgents()).toEqual(resolved.agents);
    // Override → the pod's choice wins.
    expect(await readSpecAgents(["codex"])).toEqual(["codex"]);
  });
});

/**
 * The web-fetch skill is capability-gated.
 *
 * The universal .claude layer is copied wholesale, so `capabilities.webFetch` used
 * to gate nothing on the pod — the skill shipped everywhere while the registry
 * advertised it as off by default. A flag that gates only the marketing copy makes
 * the spec lie, which is worse than having no flag.
 */

describe("web-fetch skill is gated by the capability", () => {
  const hasWebFetch = (files: { guest_path: string }[]) =>
    files.some((f) => f.guest_path.includes("/claude/skills/web-fetch/"));

  it("ships the skill when the env declares the capability", async () => {
    const { resolved, envDir } = await makePod();
    expect(resolved.capabilities.webFetch.enabled, "fixture env should declare it").toBe(true);
    expect(hasWebFetch(await buildInitFiles({ id: "x", resolved, envDir }))).toBe(true);
  });

  it("omits it when the env does not", async () => {
    const { resolved, envDir } = await makePod();
    const off = {
      ...resolved,
      capabilities: { ...resolved.capabilities, webFetch: { enabled: false } },
    };
    const files = await buildInitFiles({ id: "x", resolved: off, envDir });
    expect(hasWebFetch(files)).toBe(false);
    // …and the rest of the universal layer still arrives — the gate is one skill,
    // not the layer.
    expect(files.some((f) => f.guest_path.includes("/claude/"))).toBe(true);
  });
});
