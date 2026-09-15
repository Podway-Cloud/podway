import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The OSS/self-host provider — LocalProvider drives pods with `docker` and had NO lifecycle coverage
 * (only pure sizing helpers). "Works on cloud is not evidence for OSS." This mocks the ONE boundary it
 * uses (child_process.execFile, via the promisify custom symbol) and asserts each lifecycle op issues
 * the right docker command — mirroring how incus-provider.test.ts mocks the Incus HTTP API.
 */
const dockerCalls: string[][] = [];
const runImpl = vi.fn(async (_cmd: string, args: string[]) => {
  dockerCalls.push(args);
  // The status inspect drives getPod; everything else can be empty (endpoint/digest degrade to null).
  if (args[0] === "inspect" && (args[2] ?? "").includes("State.Status")) {
    return { stdout: "running sha256:deadbeef", stderr: "" };
  }
  return { stdout: "", stderr: "" };
});
vi.mock("node:child_process", () => ({
  // `run = promisify(execFile)` resolves via this custom symbol → returns {stdout, stderr}.
  execFile: Object.assign(() => undefined, {
    [Symbol.for("nodejs.util.promisify.custom")]: runImpl,
  }),
}));

const { LocalProvider } = await import("../src/local/provider.js");
const lp = () => new LocalProvider();

beforeEach(() => {
  dockerCalls.length = 0;
  runImpl.mockClear();
});

describe("LocalProvider lifecycle → docker commands", () => {
  it("exec runs `docker exec podway-<id> <cmd…>` and reports exit 0", async () => {
    const r = await lp().exec("p1", ["echo", "hi"]);
    expect(r.exitCode).toBe(0);
    expect(dockerCalls).toContainEqual(["exec", "podway-p1", "echo", "hi"]);
  });

  it("destroy removes the container AND its persistent home volume", async () => {
    await lp().destroy("p1");
    expect(dockerCalls).toContainEqual(["rm", "-f", "podway-p1"]);
    expect(dockerCalls).toContainEqual(["volume", "rm", "podway-p1-home"]);
  });

  it("sleep stops the container, then reports its status", async () => {
    const info = await lp().sleep("p1");
    expect(dockerCalls).toContainEqual(["stop", "podway-p1"]);
    expect(info).toMatchObject({ id: "p1", status: "running" });
  });

  it("wake starts the container", async () => {
    await lp().wake("p1");
    expect(dockerCalls).toContainEqual(["start", "podway-p1"]);
  });

  it("getPod reports 'gone' when the container is not found", async () => {
    runImpl.mockImplementationOnce(async (_c: string, args: string[]) => {
      dockerCalls.push(args);
      const e = new Error("No such container") as Error & { code: number };
      e.code = 1;
      throw e;
    });
    const info = await lp().getPod("nope");
    expect(info.status).toBe("gone");
  });
});
