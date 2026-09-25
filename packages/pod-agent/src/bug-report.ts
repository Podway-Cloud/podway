/**
 * Platform bug reports from a pod (openspec: pod-bug-reports). Pure: the server collects the raw
 * bundle and appends the result to the reports outbox; everything that decides WHAT leaves the pod —
 * scrubbing, the size cap, the area list, the rate limit — lives here, under test.
 *
 * Scrubbing happens ON the pod because only the pod knows its secret values. Two layers: every
 * declared secret value is replaced, then anything shaped like a credential (a new token nobody
 * declared) is replaced too.
 */

export const REPORT_AREAS = ["auth", "startup", "rc", "disk", "update", "cli", "other"] as const;
export type ReportArea = (typeof REPORT_AREAS)[number];
/** The whole report line, bundle included. Logs are trimmed first. */
export const REPORT_MAX_BYTES = 64 * 1024;
export const REPORTS_OUTBOX = "/home/dev/.podway/reports-outbox.jsonl";

const TOKEN_SHAPES: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{16,}/g,
  /sk-(?:proj-)?[A-Za-z0-9_-]{24,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[abpr]-[A-Za-z0-9-]{10,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /(--(?:token|password|secret|api-key)[ =])\S{8,}/gi,
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi,
];

/** Replace every secret value, then every credential-shaped string, with `[redacted]`. */
export function scrub(text: string, secretValues: string[]): string {
  let out = text;
  // Longest first, so a secret that contains another is removed whole. Skip tiny values: redacting
  // every "a" would shred the report and hide nothing.
  for (const v of [...secretValues].filter((s) => s && s.length >= 6).sort((a, b) => b.length - a.length)) {
    out = out.split(v).join("[redacted]");
  }
  for (const re of TOKEN_SHAPES) {
    out = out.replace(re, (m, prefix?: string) => (typeof prefix === "string" && m.startsWith(prefix) ? `${prefix}[redacted]` : "[redacted]"));
  }
  return out;
}

export interface ReportInput {
  summary: string;
  area: string;
  detail?: string;
  /** "agent" (podway bug) or "auto:<event>" (the pod-agent). */
  source: string;
}

export interface Report {
  summary: string;
  area: ReportArea;
  detail: string;
  source: string;
  at: string;
  bundle: Record<string, string>;
}

/** Scrub + cap. `bundle` values are raw text from the collectors (health JSON, doctor, logs, …). */
export function buildReport(input: ReportInput, bundle: Record<string, string>, secretValues: string[], at: string): Report {
  const area = (REPORT_AREAS as readonly string[]).includes(input.area) ? (input.area as ReportArea) : "other";
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(bundle)) clean[k] = scrub(String(v ?? ""), secretValues);
  const report: Report = {
    summary: scrub(input.summary, secretValues).slice(0, 300),
    area,
    detail: scrub(input.detail ?? "", secretValues).slice(0, 4000),
    source: input.source,
    at,
    bundle: clean,
  };
  // Cap: trim the logs (the bulkiest, least essential part) from the FRONT until it fits.
  while (Buffer.byteLength(JSON.stringify(report)) > REPORT_MAX_BYTES) {
    const logs = report.bundle.logs ?? "";
    if (logs.length > 200) report.bundle.logs = `…${logs.slice(Math.floor(logs.length / 2))}`;
    else {
      for (const k of Object.keys(report.bundle)) report.bundle[k] = report.bundle[k]!.slice(0, 2000);
      break;
    }
  }
  return report;
}

/** Sliding-window limit shared by manual and automatic reports. */
export class ReportLimiter {
  private readonly times: number[] = [];
  constructor(
    private readonly max = 5,
    private readonly windowMs = 3_600_000,
  ) {}
  allow(now = Date.now()): boolean {
    while (this.times.length && now - this.times[0]! > this.windowMs) this.times.shift();
    if (this.times.length >= this.max) return false;
    this.times.push(now);
    return true;
  }
}

/** Values from an env file (`KEY=value`, optional `export`, optional quotes) — the pod's secrets. */
export function secretValuesFrom(envText: string): string[] {
  const out: string[] = [];
  for (const line of envText.split("\n")) {
    const m = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=(.*)$/.exec(line);
    if (!m) continue;
    const v = m[1]!.trim().replace(/^(['"])(.*)\1$/, "$2");
    if (v) out.push(v);
  }
  return out;
}
