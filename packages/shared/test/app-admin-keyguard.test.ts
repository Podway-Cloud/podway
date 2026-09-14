import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The shared app-admin engine's KEY GUARD is the #1 safety guarantee: it refuses to run against a
 * different or empty encryption key, because that silently makes every stored credential
 * undecryptable while the app looks healthy. It reads only `.env` + `.keyguard` (no Docker), so it is
 * unit-testable in isolation. The Docker-dependent paths (deploy / safe-upgrade auto-rollback) are
 * covered by the real-infra scratch-pod smoke test, not here.
 */
const engine = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../environments/_shared/app-admin/app-admin.sh",
);
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function checkKey(env: string, pin?: string): { code: number; out: string; keyguard: string | null } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "appadmin-"));
  try {
    writeFileSync(
      path.join(dir, "app.manifest"),
      "APP_PROJECT=t\nAPP_SERVICE=t\nAPP_IMAGE_VAR=T_IMAGE\nKEYGUARD_VAR=TEST_KEY\n",
    );
    writeFileSync(path.join(dir, ".env"), env);
    if (pin !== undefined) writeFileSync(path.join(dir, ".keyguard"), pin);
    let code = 0;
    let out = "";
    try {
      out = execFileSync("bash", [engine, "check-key"], {
        env: { ...process.env, APP_ADMIN_DIR: dir },
        encoding: "utf8",
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = (err.stdout ?? "") + (err.stderr ?? "");
    }
    const kg = path.join(dir, ".keyguard");
    return { code, out, keyguard: existsSync(kg) ? readFileSync(kg, "utf8").trim() : null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("app-admin key guard", () => {
  it("first check pins the key's hash and passes", () => {
    const r = checkKey("TEST_KEY=super-secret\n");
    expect(r.code).toBe(0);
    expect(r.keyguard).toBe(sha("super-secret"));
  });

  it("passes when the key matches the pinned hash", () => {
    const r = checkKey("TEST_KEY=super-secret\n", sha("super-secret"));
    expect(r.code).toBe(0);
  });

  it("REFUSES when the key does not match the pinned hash (the brick-your-credentials case)", () => {
    const r = checkKey("TEST_KEY=a-different-key\n", sha("super-secret"));
    expect(r.code).toBe(5);
    expect(r.out).toMatch(/does NOT match/);
  });

  it("REFUSES an empty key (the app would auto-generate a throwaway one)", () => {
    const r = checkKey("TEST_KEY=\n", sha("whatever"));
    expect(r.code).toBe(5);
    expect(r.out).toMatch(/empty/);
  });

  it("is a no-op (passes) when the manifest declares no KEYGUARD_VAR", () => {
    // A separate temp dir with key-guard OFF.
    const dir = mkdtempSync(path.join(os.tmpdir(), "appadmin-"));
    try {
      writeFileSync(path.join(dir, "app.manifest"), "APP_PROJECT=t\nAPP_SERVICE=t\nAPP_IMAGE_VAR=T_IMAGE\n");
      writeFileSync(path.join(dir, ".env"), "FOO=bar\n");
      const out = execFileSync("bash", [engine, "check-key"], {
        env: { ...process.env, APP_ADMIN_DIR: dir },
        encoding: "utf8",
      });
      expect(out).toMatch(/KEY OK/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
