import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type Database } from "@podway/db";
import { CustomDomainService, type DnsResolver } from "../src/custom-domains.js";

const EDGE = { cnameTarget: "cname.podway.cloud", anycastIp: "76.76.21.9" };
const resolver = (cname: string[], a: string[], txt: string[]): DnsResolver => ({
  resolveCname: async () => cname,
  resolveA: async () => a,
  resolveTxt: async () => txt,
});

describe("CustomDomainService (add-custom-domains)", () => {
  let db: Database;
  let close: () => Promise<void>;
  let svc: CustomDomainService;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    svc = new CustomDomainService(db, { cnameTarget: "cname.podway.cloud", anycastIp: "76.76.21.9" });
  });
  afterEach(async () => close && (await close()));

  it("adds a subdomain (pending), lists it, and shows CNAME + TXT records", async () => {
    const r = await svc.add("owner1", "pod1", "  App.ACME.com  ");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.domain.hostname).toBe("app.acme.com"); // normalized
    expect(r.domain.recordType).toBe("cname");
    expect(r.domain.status).toBe("pending");

    expect(await svc.listForPod("pod1")).toHaveLength(1);

    const recs = svc.dnsRecordsFor(r.domain);
    expect(recs.find((x) => x.type === "CNAME")?.value).toBe("cname.podway.cloud");
    expect(recs.find((x) => x.type === "TXT")?.value).toBe(r.domain.verifyToken);
    expect(recs.find((x) => x.type === "A")).toBeUndefined();
  });

  it("classifies an apex domain as an A record", async () => {
    const r = await svc.add("o", "p", "acme.com");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.domain.recordType).toBe("a");
    expect(svc.dnsRecordsFor(r.domain).find((x) => x.type === "A")?.value).toBe("76.76.21.9");
  });

  it("rejects an invalid hostname and a duplicate", async () => {
    expect((await svc.add("o", "p", "not a domain")).ok).toBe(false);
    expect((await svc.add("o", "p", "x.acme.com")).ok).toBe(true);
    expect((await svc.add("o2", "p2", "x.acme.com")).ok).toBe(false); // already claimed
  });

  it("removes a domain (scoped to its owner) and frees the hostname", async () => {
    const r = await svc.add("o", "p", "y.acme.com");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    await svc.remove("o", r.domain.id);
    expect(await svc.listForPod("p")).toHaveLength(0);
    // hostname freed → re-addable
    expect((await svc.add("o", "p", "y.acme.com")).ok).toBe(true);
  });
});

describe("CustomDomainService.verify (DNS check)", () => {
  let db2: Database;
  let close2: () => Promise<void>;
  beforeEach(async () => ({ db: db2, close: close2 } = await createTestDb()));
  afterEach(async () => close2 && (await close2()));

  it("errors when records are missing, verifies when CNAME + TXT match", async () => {
    const add = await new CustomDomainService(db2, EDGE).add("o", "p", "app.acme.com");
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    const { id, verifyToken } = add.domain;

    // Nothing resolves yet → error with a plain reason.
    const missing = await new CustomDomainService(db2, EDGE, resolver([], [], [])).verify(id);
    expect(missing?.status).toBe("error");
    expect(missing?.error).toMatch(/CNAME/i);

    // CNAME points to us + the ownership TXT is present → verifying (DNS confirmed).
    const ok = await new CustomDomainService(db2, EDGE, resolver(["cname.podway.cloud."], [], [verifyToken])).verify(id);
    expect(ok?.status).toBe("verifying");
    expect(ok?.verifiedAt).not.toBeNull();
  });

  it("verifies an apex domain via its A record", async () => {
    const add = await new CustomDomainService(db2, EDGE).add("o", "p", "acme.com");
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    const ok = await new CustomDomainService(db2, EDGE, resolver([], ["76.76.21.9"], [add.domain.verifyToken])).verify(add.domain.id);
    expect(ok?.status).toBe("verifying");
  });
});
