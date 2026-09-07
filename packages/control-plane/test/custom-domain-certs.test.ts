import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb, type Database } from "@podway/db";
import { CustomDomainService, type DnsResolver } from "../src/custom-domains.js";
import { FlyCertIssuer, noCertIssuer, type CertIssuer, type CertState } from "../src/cert-issuer.js";

const EDGE = { cnameTarget: "cname.podway.cloud", anycastIp: "37.16.21.185" };
const goodDns = (token: string): DnsResolver => ({
  resolveCname: async () => ["cname.podway.cloud"],
  resolveA: async () => ["37.16.21.185"],
  resolveTxt: async () => [token],
});
const badDns: DnsResolver = {
  resolveCname: async () => [],
  resolveA: async () => [],
  resolveTxt: async () => [],
};

/** A CertIssuer that records calls and lets a test drive the edge's answer. */
function fakeIssuer(initial: CertState = "pending") {
  const calls: string[] = [];
  let state = initial;
  const issuer: CertIssuer = {
    async issue(h) {
      calls.push(`issue:${h}`);
    },
    async state() {
      return state;
    },
    async revoke(h) {
      calls.push(`revoke:${h}`);
    },
  };
  return { issuer, calls, set: (s: CertState) => (state = s) };
}

describe("custom domains — a domain is live because HTTPS works, not because DNS is right", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeEach(async () => ({ db, close } = await createTestDb()));
  afterEach(async () => close && (await close()));

  async function seed(f: ReturnType<typeof fakeIssuer>, dns?: DnsResolver) {
    const probe = new CustomDomainService(db, EDGE);
    const added = await probe.add("o1", "pod1", "app.acme.com");
    if (!added.ok) throw new Error(added.error);
    const svc = new CustomDomainService(db, EDGE, dns ?? goodDns(added.domain.verifyToken), f.issuer);
    return { svc, id: added.domain.id };
  }

  it("asks the edge for a certificate the moment DNS checks out", async () => {
    const f = fakeIssuer();
    const { svc, id } = await seed(f);
    const d = await svc.verify(id);
    expect(d?.status).toBe("verifying");
    expect(f.calls).toContain("issue:app.acme.com");
  });

  it("does NOT ask for a certificate while DNS is still wrong", async () => {
    const f = fakeIssuer();
    const { svc, id } = await seed(f, badDns);
    const d = await svc.verify(id);
    expect(d?.status).toBe("error");
    expect(f.calls).toHaveLength(0);
  });

  it("stays `verifying` while the cert is pending — correct DNS is NOT a working site", async () => {
    const f = fakeIssuer("pending");
    const { svc, id } = await seed(f);
    await svc.verify(id);
    const d = await svc.refreshCert(id);
    expect(d?.status).toBe("verifying");
    expect(d?.certStatus).not.toBe("issued");
  });

  it("goes live only once the edge reports the certificate issued", async () => {
    const f = fakeIssuer("pending");
    const { svc, id } = await seed(f);
    await svc.verify(id);
    expect((await svc.refreshCert(id))?.status).toBe("verifying");
    f.set("issued");
    const d = await svc.refreshCert(id);
    expect(d?.status).toBe("active");
    expect(d?.certStatus).toBe("issued");
  });

  it("reports a failed certificate as an error the owner can act on", async () => {
    const f = fakeIssuer("failed");
    const { svc, id } = await seed(f);
    await svc.verify(id);
    const d = await svc.refreshCert(id);
    expect(d?.status).toBe("error");
    expect(d?.certStatus).toBe("failed");
    expect(d?.error).toMatch(/certificate/i);
  });

  it("an unreachable edge changes NOTHING — it must not look like failure", async () => {
    const f = fakeIssuer("pending");
    const { svc, id } = await seed(f);
    await svc.verify(id);
    const broken = new CustomDomainService(db, EDGE, goodDns("x"), {
      issue: async () => {},
      state: async () => {
        throw new Error("fly is down");
      },
      revoke: async () => {},
    });
    const d = await broken.refreshCert(id);
    expect(d?.status).toBe("verifying"); // unchanged, not "error"
  });

  it("revokes the certificate when the owner removes the domain", async () => {
    const f = fakeIssuer("issued");
    const { svc, id } = await seed(f);
    await svc.remove("o1", id);
    expect(f.calls).toContain("revoke:app.acme.com");
    expect(await svc.listForPod("pod1")).toHaveLength(0);
  });

  it("does not revoke on a removal by someone who does not own it", async () => {
    const f = fakeIssuer("issued");
    const { svc, id } = await seed(f);
    await svc.remove("someone-else", id);
    expect(f.calls.filter((c) => c.startsWith("revoke"))).toHaveLength(0);
    expect(await svc.listForPod("pod1")).toHaveLength(1); // still there
  });

  it("with the default no-op issuer a domain can NEVER reach active", async () => {
    const probe = new CustomDomainService(db, EDGE);
    const added = await probe.add("o1", "pod2", "b.acme.com");
    if (!added.ok) throw new Error(added.error);
    const svc = new CustomDomainService(db, EDGE, goodDns(added.domain.verifyToken), noCertIssuer);
    await svc.verify(added.domain.id);
    expect((await svc.refreshCert(added.domain.id))?.status).toBe("verifying");
  });
});

describe("FlyCertIssuer reads Fly's human-facing status honestly", () => {
  const issuerWith = (clientStatus: string | null) =>
    new FlyCertIssuer("app", "tok", "https://fly.test/graphql", (async () =>
      new Response(JSON.stringify({ data: { app: { certificate: clientStatus === null ? null : { clientStatus } } } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch);

  it("maps Fly's real 'Ready' to issued", async () => {
    expect(await issuerWith("Ready").state("a.com")).toBe("issued");
  });

  it("treats an UNRECOGNISED status as pending, never failed", async () => {
    // A domain that is merely slow must not be reported to its owner as broken.
    expect(await issuerWith("Awaiting configuration").state("a.com")).toBe("pending");
    expect(await issuerWith("Some new status Fly invented").state("a.com")).toBe("pending");
  });

  it("maps a failure to failed, and an absent certificate to none", async () => {
    expect(await issuerWith("Verification failed").state("a.com")).toBe("failed");
    expect(await issuerWith(null).state("a.com")).toBe("none");
  });
});

describe("routing lookup — only a LIVE domain serves", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeEach(async () => ({ db, close } = await createTestDb()));
  afterEach(async () => close && (await close()));

  async function domainInState(f: ReturnType<typeof fakeIssuer>, host = "app.acme.com") {
    const probe = new CustomDomainService(db, EDGE);
    const added = await probe.add("o1", "pod-abc", host);
    if (!added.ok) throw new Error(added.error);
    const svc = new CustomDomainService(db, EDGE, goodDns(added.domain.verifyToken), f.issuer);
    return { svc, id: added.domain.id };
  }

  it("a PENDING domain does not resolve — nothing has been verified", async () => {
    const { svc } = await domainInState(fakeIssuer());
    expect(await svc.activePodFor("app.acme.com")).toBeNull();
  });

  it("a VERIFYING domain does not resolve — the cert isn't issued, so a visitor would get a TLS error", async () => {
    const f = fakeIssuer("pending");
    const { svc, id } = await domainInState(f);
    await svc.verify(id);
    await svc.refreshCert(id);
    expect(await svc.activePodFor("app.acme.com")).toBeNull();
  });

  it("an ACTIVE domain resolves to its pod", async () => {
    const f = fakeIssuer("issued");
    const { svc, id } = await domainInState(f);
    await svc.verify(id);
    await svc.refreshCert(id);
    expect(await svc.activePodFor("app.acme.com")).toBe("pod-abc");
  });

  it("matches case-insensitively and ignores stray whitespace, like a real Host header", async () => {
    const f = fakeIssuer("issued");
    const { svc, id } = await domainInState(f);
    await svc.verify(id);
    await svc.refreshCert(id);
    expect(await svc.activePodFor("  APP.Acme.COM ")).toBe("pod-abc");
  });

  it("an unknown hostname resolves to nothing", async () => {
    const f = fakeIssuer("issued");
    const { svc, id } = await domainInState(f);
    await svc.verify(id);
    await svc.refreshCert(id);
    expect(await svc.activePodFor("someone-elses-site.com")).toBeNull();
    expect(await svc.activePodFor("")).toBeNull();
  });
});

describe("the poller advances domains with nobody watching", () => {
  let db: Database;
  let close: () => Promise<void>;
  beforeEach(async () => ({ db, close } = await createTestDb()));
  afterEach(async () => close && (await close()));

  async function seed(host: string, f: ReturnType<typeof fakeIssuer>) {
    const probe = new CustomDomainService(db, EDGE);
    const added = await probe.add("o1", "pod1", host);
    if (!added.ok) throw new Error(added.error);
    return {
      svc: new CustomDomainService(db, EDGE, goodDns(added.domain.verifyToken), f.issuer),
      id: added.domain.id,
    };
  }

  it("takes a domain all the way from pending to LIVE without any owner action", async () => {
    const f = fakeIssuer("issued");
    const { svc } = await seed("app.acme.com", f);
    const r = await svc.pollPending();
    expect(r.checked).toBe(1);
    expect(r.nowActive).toEqual(["app.acme.com"]);
    expect(await svc.activePodFor("app.acme.com")).toBe("pod1");
  });

  it("this is the exact bug: the cert lands AFTER the owner closes the tab", async () => {
    const f = fakeIssuer("pending");
    const { svc, id } = await seed("app.acme.com", f);
    await svc.verify(id); // the owner's last look — DNS is fine, cert is not ready
    expect((await svc.get(id))?.status).toBe("verifying");

    await svc.pollPending();
    expect((await svc.get(id))?.status).toBe("verifying"); // still not ready, still honest

    f.set("issued"); // Let's Encrypt finishes; nobody is watching
    const r = await svc.pollPending();
    expect(r.nowActive).toEqual(["app.acme.com"]);
    expect((await svc.get(id))?.status).toBe("active");
  });

  it("NEVER touches an active or disabled domain — a sweep must not un-publish a working site", async () => {
    const f = fakeIssuer("issued");
    const { svc, id } = await seed("app.acme.com", f);
    await svc.pollPending();
    expect((await svc.get(id))?.status).toBe("active");

    // the edge now reports nonsense; an active domain must not be dragged backwards by a sweep
    f.set("none");
    const r = await svc.pollPending();
    expect(r.checked).toBe(0); // active is not even looked at
    expect((await svc.get(id))?.status).toBe("active");
  });

  it("one broken domain does not stop the others — the broken one is the likely one", async () => {
    const good = fakeIssuer("issued");
    await seed("a.acme.com", good);
    await seed("b.acme.com", good);
    const probe = new CustomDomainService(db, EDGE);
    const rows = await probe.listForPod("pod1");
    const svc = new CustomDomainService(db, EDGE, goodDns(rows[0]!.verifyToken), {
      issue: async (h) => {
        if (h === "a.acme.com") throw new Error("fly refused");
      },
      state: async (h) => (h === "a.acme.com" ? (() => { throw new Error("boom"); })() : "issued"),
      revoke: async () => {},
    });
    const r = await svc.pollPending();
    expect(r.checked).toBe(2); // both were attempted despite the first throwing
  });

  it("is bounded, so a large backlog cannot make one sweep run forever", async () => {
    const f = fakeIssuer("pending");
    for (let i = 0; i < 6; i++) await seed(`h${i}.acme.com`, f);
    const { svc } = await seed("last.acme.com", f);
    const r = await svc.pollPending({ limit: 3 });
    expect(r.checked).toBe(3);
  });
});
