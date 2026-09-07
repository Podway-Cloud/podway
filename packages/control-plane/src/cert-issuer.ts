/**
 * Certificate issuance for custom domains.
 *
 * The original design called for standing up Caddy with on-demand TLS in front of the gateway,
 * plus a volume to persist the cert store across redeploys. That turned out to be unnecessary:
 * Fly already issues and renews a certificate per hostname on an app — it does exactly that for
 * `gw.podway.cloud` and `*.preview.podway.cloud` today. So a customer domain is one API call, and
 * the whole Caddy layer (and its volume, and its redeploy-survival problem) disappears.
 *
 * The interface exists so the control-plane never talks to a provider directly, and so tests can
 * run without the network.
 */

export type CertState = "none" | "pending" | "issued" | "failed";

export interface CertIssuer {
  /** Ask the edge for a certificate. MUST be idempotent — the poller calls it more than once. */
  issue(hostname: string): Promise<void>;
  /** What the edge currently thinks. */
  state(hostname: string): Promise<CertState>;
  /** Stop serving and renewing it. Called when an owner removes a domain. */
  revoke(hostname: string): Promise<void>;
}

/** Used when the edge is unprovisioned: every call is a no-op and nothing ever reports issued. */
export const noCertIssuer: CertIssuer = {
  async issue() {},
  async state() {
    return "none";
  },
  async revoke() {},
};

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

/**
 * Fly's certificate API (GraphQL). `addCertificate` is idempotent for a hostname already on the
 * app, which is what lets the poller retry safely.
 */
export class FlyCertIssuer implements CertIssuer {
  constructor(
    private appName: string,
    private token: string,
    private endpoint = "https://api.fly.io/graphql",
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`fly graphql ${res.status}`);
    const body = (await res.json()) as GraphQLResponse<T>;
    if (body.errors?.length) throw new Error(`fly graphql: ${body.errors.map((e) => e.message).join("; ")}`);
    if (!body.data) throw new Error("fly graphql: no data");
    return body.data;
  }

  async issue(hostname: string): Promise<void> {
    await this.gql(
      `mutation($app:ID!,$host:String!){addCertificate(appId:$app,hostname:$host){certificate{hostname}}}`,
      { app: this.appName, host: hostname },
    );
  }

  async state(hostname: string): Promise<CertState> {
    const d = await this.gql<{
      app: { certificate: { clientStatus: string | null } | null } | null;
    }>(
      `query($app:String!,$host:String!){app(name:$app){certificate(hostname:$host){clientStatus}}}`,
      { app: this.appName, host: hostname },
    ).catch(() => null);
    const s = d?.app?.certificate?.clientStatus;
    if (!s) return "none";
    // Fly's clientStatus is human-facing text ("Ready", "Awaiting configuration", …), so match
    // loosely and treat anything unrecognised as still pending rather than failed — a domain that
    // is merely slow must not be reported to its owner as broken.
    const t = s.toLowerCase();
    if (t.includes("ready") || t.includes("issued")) return "issued";
    if (t.includes("fail") || t.includes("error")) return "failed";
    return "pending";
  }

  async revoke(hostname: string): Promise<void> {
    await this.gql(
      `mutation($app:ID!,$host:String!){deleteCertificate(appId:$app,hostname:$host){app{name}}}`,
      { app: this.appName, host: hostname },
    ).catch(() => undefined); // best-effort: a already-gone cert must not block removing the row
  }
}
