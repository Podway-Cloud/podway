import { describe, it, expect, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guards the codex-standalone disk leak (reported by test:1, 2026-09-23): the updater and the
// standalone self-updater both add ~320M release dirs and neither prunes, filling the volume until
// handoff-note writes fail. `podway __prune-codex-releases <dir>` must keep ONLY the running release
// (current) + the pending self-update (auto-update-version) and delete the rest — and must NEVER
// prune when it cannot confirm the running release (a full disk beats deleting the live binary).

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pod-base", "podway");
const REL = (v: string) => `${v}-x86_64-unknown-linux-musl`;

let sa: string;

async function seed(versions: string[]) {
  await fs.mkdir(path.join(sa, "releases"), { recursive: true });
  for (const v of versions) {
    const d = path.join(sa, "releases", REL(v));
    await fs.mkdir(d, { recursive: true });
    await fs.writeFile(path.join(d, "codex"), "#!/bin/sh\n", { mode: 0o755 });
  }
}
const setCurrent = (v: string) =>
  fs.symlink(`releases/${REL(v)}`, path.join(sa, "current"));
const setPending = (v: string) =>
  fs.writeFile(path.join(sa, "auto-update-version"), REL(v)); // no trailing newline, as on a real pod
const prune = () =>
  execFileSync("bash", [cli, "__prune-codex-releases", sa], { encoding: "utf8" }).trim();
const releasesLeft = async () =>
  (await fs.readdir(path.join(sa, "releases"))).sort();

beforeEach(async () => {
  sa = await fs.mkdtemp(path.join(os.tmpdir(), "codex-sa-"));
});

describe("podway __prune-codex-releases", () => {
  it("keeps ONLY current + pending and deletes the rest", async () => {
    await seed(["0.147.0", "0.149.1", "0.150.0", "0.153.0", "0.155.0", "0.155.1", "0.156.0"]);
    await setCurrent("0.155.1");
    await setPending("0.156.0");

    const removed = prune();

    expect(removed).toBe("5");
    expect(await releasesLeft()).toEqual([REL("0.155.1"), REL("0.156.0")].sort());
    // the running binary survived
    await expect(fs.access(path.join(sa, "current", "codex"))).resolves.toBeUndefined();
  });

  it("keeps only current when there is no pending self-update", async () => {
    await seed(["0.150.0", "0.155.0", "0.155.1"]);
    await setCurrent("0.155.1");
    // no auto-update-version file

    const removed = prune();

    expect(removed).toBe("2");
    expect(await releasesLeft()).toEqual([REL("0.155.1")]);
  });

  it("FAIL-SAFE: prunes nothing when current cannot be resolved", async () => {
    await seed(["0.150.0", "0.155.0", "0.155.1", "0.156.0"]);
    // no `current` symlink at all
    await setPending("0.156.0");

    const removed = prune();

    expect(removed).toBe("0");
    expect((await releasesLeft()).length).toBe(4); // untouched
  });

  it("FAIL-SAFE: prunes nothing when current dangles (target missing)", async () => {
    await seed(["0.150.0", "0.155.0"]);
    await setCurrent("0.999.9"); // points at a release that does not exist
    await setPending("0.155.0");

    const removed = prune();

    expect(removed).toBe("0");
    expect((await releasesLeft()).length).toBe(2); // untouched
  });

  it("is a no-op on a fresh dir with no releases", async () => {
    const removed = prune();
    expect(removed).toBe("0");
  });
});
