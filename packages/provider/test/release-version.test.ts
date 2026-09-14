import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const recordImage = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../scripts/incus/record-image.sh",
);

/**
 * Every pod-base image ship IS a release, so the recorded manifest row must carry its OWN version.
 * Attaching it used to be a separate, easily-forgotten `cut-release.sh` run — so three different
 * images shipped version-less in a row and the owner's update dialog showed the same v0.7.0 for all
 * of them (2026-09-04). record-image.sh now computes it on every ship; these are the bump rules.
 */
async function releaseVersion(
  env: { RELEASE_LATEST_TAG?: string; RELEASE_CHANGELOG_TOP?: string; RELEASE_BUMP?: string },
): Promise<string> {
  const src = await fs.readFile(recordImage, "utf8");
  const start = src.indexOf("release_version() {");
  expect(start, "release_version() must exist in record-image.sh").toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf("\n}", start) + 2);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "relver-"));
  try {
    const script = path.join(dir, "v.sh");
    await fs.writeFile(script, `#!/usr/bin/env bash\nset -u\n${body}\nrelease_version\n`);
    return execFileSync("bash", [script], {
      encoding: "utf8",
      env: { ...process.env, ...env },
    }).trim();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("release version (record-image.sh)", () => {
  it("uses the CHANGELOG version when it is ahead of the newest tag", async () => {
    // The notes were written for that version — it wins over an automatic bump.
    expect(await releaseVersion({ RELEASE_LATEST_TAG: "0.7.0", RELEASE_CHANGELOG_TOP: "0.8.0" })).toBe("0.8.0");
  });

  it("bumps PATCH by default once the CHANGELOG version is already released", async () => {
    expect(await releaseVersion({ RELEASE_LATEST_TAG: "0.8.0", RELEASE_CHANGELOG_TOP: "0.8.0" })).toBe("0.8.1");
  });

  it("bumps MINOR on request", async () => {
    expect(
      await releaseVersion({ RELEASE_LATEST_TAG: "0.8.0", RELEASE_CHANGELOG_TOP: "0.8.0", RELEASE_BUMP: "minor" }),
    ).toBe("0.9.0");
  });

  it("bumps MAJOR only when explicitly asked (never automatic)", async () => {
    expect(
      await releaseVersion({ RELEASE_LATEST_TAG: "0.8.0", RELEASE_CHANGELOG_TOP: "0.8.0", RELEASE_BUMP: "major" }),
    ).toBe("1.0.0");
    // …and an unknown/absent bump kind must fall back to PATCH, never major.
    expect(
      await releaseVersion({ RELEASE_LATEST_TAG: "0.8.0", RELEASE_CHANGELOG_TOP: "0.8.0", RELEASE_BUMP: "" }),
    ).toBe("0.8.1");
  });

  it("never reuses the released version — the bug that showed one version for three images", async () => {
    const v = await releaseVersion({ RELEASE_LATEST_TAG: "0.8.0", RELEASE_CHANGELOG_TOP: "0.8.0" });
    expect(v).not.toBe("0.8.0");
  });

  it("ignores a CHANGELOG version that is BEHIND the newest tag", async () => {
    expect(await releaseVersion({ RELEASE_LATEST_TAG: "0.9.0", RELEASE_CHANGELOG_TOP: "0.7.0" })).toBe("0.9.1");
  });

  it("starts from 0.0.1 when there are no tags yet", async () => {
    expect(await releaseVersion({ RELEASE_LATEST_TAG: "", RELEASE_CHANGELOG_TOP: "" })).toBe("0.0.1");
  });
});

/**
 * A computed version is not enough — it must also be FREE. Because CHANGELOG.md declares the next
 * version before it is tagged, the "CHANGELOG wins" rule returns that same version on every ship
 * until the tag is cut, so a second image would claim a version the current one already has.
 * next_free_version() is the guard: bump PATCH until nothing owns it.
 */
async function nextFreeVersion(candidate: string, taken: string): Promise<string> {
  const src = await fs.readFile(recordImage, "utf8");
  const grab = (name: string) => {
    const start = src.indexOf(`${name}() {`);
    expect(start, `${name}() must exist in record-image.sh`).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf("\n}", start) + 2);
  };
  const body = `${grab("taken_versions")}\n${grab("next_free_version")}`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "freever-"));
  try {
    const script = path.join(dir, "v.sh");
    await fs.writeFile(script, `#!/usr/bin/env bash\nset -u\nMANIFEST_RELEASES=""\n${body}\nnext_free_version "$1"\n`);
    return execFileSync("bash", [script, candidate], {
      encoding: "utf8",
      env: { ...process.env, RELEASE_TAKEN_VERSIONS: taken },
    }).trim();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

describe("version uniqueness (record-image.sh)", () => {
  it("keeps the computed version when nothing owns it", async () => {
    expect(await nextFreeVersion("0.8.1", "0.7.0 0.8.0")).toBe("0.8.1");
  });

  it("never hands a second image a version that is already assigned", async () => {
    // The real 2026-09-04 state: CHANGELOG says 0.8.0, v0.8.0 is uncut, and the CURRENT image
    // already carries 0.8.0. Without this the next build ships 0.8.0 a second time.
    expect(await nextFreeVersion("0.8.0", "0.8.0 0.7.0 0.7.0")).toBe("0.8.1");
  });

  it("skips a whole run of taken patches", async () => {
    expect(await nextFreeVersion("0.8.0", "0.8.0 0.8.1 0.8.2")).toBe("0.8.3");
  });

  it("is a no-op on an empty taken list — the computed version stands (the caller's guard decides trust)", async () => {
    // next_free_version itself can't tell "empty because first ship" from "empty because the fetch
    // failed" — that judgment lives in untrusted_versions_reason (below), which refuses the failure.
    expect(await nextFreeVersion("0.8.0", "")).toBe("0.8.0");
  });

  it("only bumps PATCH — it never invents a minor or major", async () => {
    expect(await nextFreeVersion("1.0.0", "1.0.0")).toBe("1.0.1");
  });
});

/**
 * The uniqueness bump is only as good as the taken-versions list. A SILENT fetch failure empties that
 * list, skips the bump, and mislabels the release — 0.8.16 recorded OVER a live 0.8.17 (2026-09-14),
 * and a duplicate 0.8.13 before that. untrusted_versions_reason() is the guard: it refuses to record
 * when the list can't be trusted, distinguishing a genuine first-ever ship from a real failure.
 */
async function untrustedReason(env: {
  MANIFEST_RELEASES: string;
  CURRENT_DIGEST: string;
  RELEASE_VERSION?: string;
}): Promise<string> {
  const src = await fs.readFile(recordImage, "utf8");
  const grab = (name: string) => {
    const start = src.indexOf(`${name}() {`);
    expect(start, `${name}() must exist in record-image.sh`).toBeGreaterThan(-1);
    return src.slice(start, src.indexOf("\n}", start) + 2);
  };
  const body = `${grab("taken_versions")}\n${grab("untrusted_versions_reason")}`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "trust-"));
  try {
    const script = path.join(dir, "v.sh");
    // MANIFEST_RELEASES / CURRENT_DIGEST are set by the caller; unset RELEASE_TAKEN_VERSIONS so the
    // guard reads the (mocked) manifest exactly as the real script does.
    await fs.writeFile(
      script,
      `#!/usr/bin/env bash\nset -u\nMANIFEST_RELEASES=${JSON.stringify(env.MANIFEST_RELEASES)}\nCURRENT_DIGEST=${JSON.stringify(env.CURRENT_DIGEST)}\nRELEASE_VERSION=${JSON.stringify(env.RELEASE_VERSION ?? "")}\n${body}\nuntrusted_versions_reason\n`,
    );
    const e = { ...process.env };
    delete (e as Record<string, string>).RELEASE_TAKEN_VERSIONS;
    return execFileSync("bash", [script], { encoding: "utf8", env: e }).trim();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const releasesJson = (...vers: string[]) => vers.map((v) => `{"version":"${v}"}`).join(",");

describe("version trust guard (record-image.sh)", () => {
  it("REFUSES when the releases fetch failed (the 0.8.16-over-0.8.17 bug's actual trigger)", async () => {
    const reason = await untrustedReason({ MANIFEST_RELEASES: "__FETCH_FAILED__", CURRENT_DIGEST: "cbf0e535da92" });
    expect(reason).toMatch(/fetch FAILED/);
  });

  it("REFUSES on an empty releases list while a current image already exists", async () => {
    const reason = await untrustedReason({ MANIFEST_RELEASES: "[]", CURRENT_DIGEST: "cbf0e535da92" });
    expect(reason).toMatch(/EMPTY while the manifest already has a current image/);
  });

  it("TRUSTS a genuine first-ever ship — empty list AND no current image", async () => {
    expect(await untrustedReason({ MANIFEST_RELEASES: "[]", CURRENT_DIGEST: "" })).toBe("");
  });

  it("TRUSTS a healthy manifest with versions present", async () => {
    expect(await untrustedReason({ MANIFEST_RELEASES: releasesJson("0.8.17", "0.8.15"), CURRENT_DIGEST: "abc123" })).toBe("");
  });

  it("is SKIPPED when the caller pinned RELEASE_VERSION (a deliberate re-record)", async () => {
    // Even a failed fetch is fine — the version is not being computed from the list.
    expect(
      await untrustedReason({ MANIFEST_RELEASES: "__FETCH_FAILED__", CURRENT_DIGEST: "abc123", RELEASE_VERSION: "0.8.18" }),
    ).toBe("");
  });
});
