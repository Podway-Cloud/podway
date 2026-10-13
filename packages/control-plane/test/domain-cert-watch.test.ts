import { describe, expect, it } from "vitest";
import { DomainCertWatch, certProblem, WARN_DAYS, type CertProbe } from "../src/domain-cert-watch.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 12);

describe("custom-domain certificate watch", () => {
  it("a healthy certificate (renewed, > 14 days) is not a problem; close to expiry, expired or broken is", () => {
    expect(certProblem({ validTo: new Date(NOW + 60 * DAY) }, NOW)).toBeNull();
    expect(certProblem({ validTo: new Date(NOW + (WARN_DAYS - 1) * DAY) }, NOW)).toContain("expires in 13 days");
    expect(certProblem({ validTo: new Date(NOW - DAY) }, NOW)).toBe("its HTTPS certificate has expired");
    expect(certProblem({ error: "certificate has expired" }, NOW)).toContain("not working");
  });

  it("emails the owner at most once a day per domain, and forgets a fixed one", async () => {
    let t = NOW;
    let probe: CertProbe = { validTo: new Date(NOW + 3 * DAY) };
    const sent: string[] = [];
    const w = new DomainCertWatch({
      listActive: async () => [{ id: "d1", hostname: "shop.example.com", podId: "p1", ownerId: "u1" }],
      probe: async () => probe,
      owner: async () => ({ name: "Ada", email: "ada@x.com" }),
      sendEmail: async (_to, subject) => void sent.push(subject),
      appUrl: "https://podway.io",
      now: () => t,
    });
    await w.sweep();
    t += 3600_000;
    await w.sweep(); // an hour later: no repeat
    expect(sent).toEqual(["shop.example.com: HTTPS problem"]);
    t += DAY;
    await w.sweep(); // a day later: again
    expect(sent).toHaveLength(2);
    probe = { validTo: new Date(t + 80 * DAY) }; // renewed
    expect((await w.sweep()).warned).toEqual([]);
  });
});
