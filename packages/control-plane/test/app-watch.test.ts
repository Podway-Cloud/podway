import { describe, expect, it } from "vitest";
import { AppWatchService, FAILS_TO_ACT, type Health } from "../src/app-watch.js";

const UP: Health = { down: null, warn: null };
const DOWN: Health = { down: "the app page does not answer", warn: null };

function harness(checks: Health[]) {
  const seq = [...checks];
  const log = { restarts: 0, emails: [] as string[], messages: [] as string[] };
  const svc = new AppWatchService({
    listPods: async () => [{ id: "p1", name: "My kuma", ownerId: "u1", app: "Uptime Kuma" }],
    check: async () => seq.shift() ?? UP,
    restart: async () => void log.restarts++,
    sendPodMessage: async (_p, _o, body) => void log.messages.push(body),
    owner: async () => ({ name: "Ada", email: "ada@x.com" }),
    sendEmail: async (_to, subject) => void log.emails.push(subject),
    appUrl: "https://podway.io",
    sleep: async () => undefined,
  });
  return { svc, log };
}

describe("app watch: Podway checks app pods, restarts, emails, wakes the agent", () => {
  it("one failed check is not an incident (no restart, no email)", async () => {
    const { svc, log } = harness([DOWN, UP]);
    await svc.sweep();
    await svc.sweep();
    expect(log).toEqual({ restarts: 0, emails: [], messages: [] });
  });

  it(`${FAILS_TO_ACT} fails in a row: restart, re-check, ONE email, agent woken — fixed by the restart`, async () => {
    const { svc, log } = harness([DOWN, DOWN, UP, UP]);
    await svc.sweep();
    await svc.sweep(); // acts: restart, then the re-check is UP
    await svc.sweep(); // healthy: no recovery email (the first email already said it is back)
    expect(log.restarts).toBe(1);
    expect(log.emails).toEqual(["Uptime Kuma was down — Podway restarted it"]);
    expect(log.messages).toHaveLength(1);
    expect(log.messages[0]).toContain("root cause");
  });

  it("restart does not help: a 'down' email now, and a 'back up' email when it recovers — never repeated", async () => {
    const { svc, log } = harness([DOWN, DOWN, DOWN, DOWN, UP]); // 3rd = the re-check after the restart
    await svc.sweep();
    await svc.sweep(); // acts; re-check still DOWN
    await svc.sweep(); // still down: no new restart, no new email
    await svc.sweep(); // recovered
    expect(log.restarts).toBe(1);
    expect(log.emails).toEqual(["Uptime Kuma is down", "Uptime Kuma is back up"]);
  });

  it("a disk warning emails at most once a day and never restarts", async () => {
    const warn: Health = { down: null, warn: "the disk is 93% full" };
    let t = 0;
    const seq = [warn, warn, warn];
    const emails: string[] = [];
    let restarts = 0;
    const svc = new AppWatchService({
      listPods: async () => [{ id: "p1", name: null, ownerId: "u1", app: "Gitea" }],
      check: async () => seq.shift() ?? UP,
      restart: async () => void restarts++,
      sendPodMessage: async () => undefined,
      owner: async () => ({ name: null, email: "a@x.com" }),
      sendEmail: async (_to, s) => void emails.push(s),
      appUrl: "https://podway.io",
      now: () => t,
    });
    t = 25 * 3600_000;
    await svc.sweep();
    t += 3600_000;
    await svc.sweep(); // an hour later: no second email
    t += 24 * 3600_000;
    await svc.sweep(); // a day later: again
    expect(emails).toEqual(["Gitea needs attention", "Gitea needs attention"]);
    expect(restarts).toBe(0);
  });
});

describe("parseAppHealth: the in-pod probe in plain words", () => {
  it("up: a page (incl. a login redirect or 404) and running containers", async () => {
    const { parseAppHealth } = await import("../src/app-watch.js");
    expect(parseAppHealth("http=200\ndisk=40\n")).toEqual({ down: null, warn: null });
    expect(parseAppHealth("http=302\ndisk=40\n")).toEqual({ down: null, warn: null });
  });
  it("down: no answer, a 5xx, or a crashed container; warn: a full disk", async () => {
    const { parseAppHealth } = await import("../src/app-watch.js");
    expect(parseAppHealth("http=000\ndisk=40\n").down).toBe("the app page does not answer");
    expect(parseAppHealth("http=502\ndisk=40\n").down).toBe("the app page returns an error (HTTP 502)");
    expect(parseAppHealth("http=200\nbad=db(exited)\ndisk=40\n").down).toBe("a container stopped: db(exited)");
    expect(parseAppHealth("http=200\ndisk=93\n")).toEqual({ down: null, warn: "the disk is 93% full" });
  });
});
