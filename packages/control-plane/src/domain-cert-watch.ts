/**
 * Custom-domain TLS watch (owner, 2026-10-12). Fly renews a custom domain's certificate itself, about 30
 * days before it expires — so a certificate with under WARN_DAYS left, or a domain that no longer
 * completes a TLS handshake, means renewal failed and the owner's site is about to break. Checked daily;
 * the owner is emailed at most once a day per domain. Pure of I/O (every effect is a dependency).
 * ponytail: once-a-day state is in memory; a gateway restart can repeat one email.
 */

export const WARN_DAYS = 14;
const DAY = 86_400_000;

export interface WatchedDomain {
  id: string;
  hostname: string;
  podId: string;
  ownerId: string;
}

/** A handshake result: the certificate's expiry, or why there is no valid certificate. */
export type CertProbe = { validTo: Date } | { error: string };

export interface DomainCertDeps {
  listActive: () => Promise<WatchedDomain[]>;
  probe: (hostname: string) => Promise<CertProbe>;
  owner: (ownerId: string) => Promise<{ name: string | null; email: string | null } | null>;
  sendEmail: (
    to: string,
    subject: string,
    content: { name?: string | null; heading: string; paragraphs: string[]; button?: { label: string; url: string }; footer: string },
  ) => Promise<void>;
  appUrl: string;
  now?: () => number;
}

/** Plain-words problem for one probe, or null when the certificate is fine. */
export function certProblem(p: CertProbe, now: number): string | null {
  if ("error" in p) return `its HTTPS certificate is not working (${p.error})`;
  const days = Math.floor((p.validTo.getTime() - now) / DAY);
  if (days < 0) return "its HTTPS certificate has expired";
  return days < WARN_DAYS ? `its HTTPS certificate expires in ${days} day${days === 1 ? "" : "s"} and did not renew` : null;
}

export class DomainCertWatch {
  private lastWarn = new Map<string, number>();
  constructor(private deps: DomainCertDeps) {}

  async sweep(): Promise<{ checked: number; warned: string[] }> {
    const now = (this.deps.now ?? Date.now)();
    const warned: string[] = [];
    const domains = await this.deps.listActive();
    for (const d of domains) {
      const problem = certProblem(await this.deps.probe(d.hostname).catch((e) => ({ error: String(e?.message ?? e) })), now);
      if (!problem) {
        this.lastWarn.delete(d.id);
        continue;
      }
      if (now - (this.lastWarn.get(d.id) ?? -Infinity) < DAY) continue;
      this.lastWarn.set(d.id, now);
      warned.push(d.hostname);
      const o = await this.deps.owner(d.ownerId).catch(() => null);
      if (!o?.email) continue;
      await this.deps
        .sendEmail(o.email, `${d.hostname}: HTTPS problem`, {
          name: o.name,
          heading: `${d.hostname} needs attention`,
          paragraphs: [
            `Your domain ${d.hostname} — ${problem}.`,
            "Visitors will soon see a security warning. Open the domain in your pod and click Re-check; if that does not fix it, reply to this email.",
          ],
          button: { label: "Open your pod", url: `${this.deps.appUrl}/dashboard/pods/${d.podId}?tab=settings` },
          footer: "Podway checks your custom domains' certificates every day.",
        })
        .catch(() => undefined);
    }
    return { checked: domains.length, warned };
  }
}
