"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listCustomDomains } from "@/lib/custom-domain-actions";

/**
 * The "Custom domain" row in a pod's Settings, directly under Preview access (add-custom-domains).
 * One row carries the whole lifecycle: none → "Set up domain…"; verifying/active/error show the
 * hostname + a status tag and a single "Manage" button. Both open the wizard PAGE at ./domain.
 * Cloud-only — the parent passes `oss` and we render nothing on self-host.
 */
const STATUS: Record<string, { dot: string; tag: string; tagCls: string; desc: string }> = {
  pending: { dot: "bg-warning", tag: "Not set up", tagCls: "text-warning bg-warning/12", desc: "Add your DNS records to finish." },
  verifying: { dot: "bg-warning animate-pulse", tag: "Verifying", tagCls: "text-warning bg-warning/12", desc: "Checking your DNS — this can take a few minutes." },
  active: { dot: "bg-success", tag: "Live", tagCls: "text-success bg-success/12", desc: "HTTPS on · certificate auto-renews · public." },
  error: { dot: "bg-destructive", tag: "Needs attention", tagCls: "text-destructive bg-destructive/12", desc: "We can't see your DNS records yet." },
  disabled: { dot: "bg-muted-foreground/60", tag: "Off", tagCls: "text-muted-foreground bg-muted", desc: "This domain is turned off." },
};

export default function CustomDomainRow({
  slug,
  oss = false,
  provisioned = false,
}: {
  slug: string;
  oss?: boolean;
  /** Whether the TLS edge exists. False hides the row entirely — see customDomainsProvisioned(). */
  provisioned?: boolean;
}) {
  const available = !oss && provisioned;
  const { data, isLoading } = useQuery({
    queryKey: ["custom-domains", slug],
    queryFn: () => listCustomDomains(slug),
    enabled: available,
  });

  if (!available) return null;

  const domain = data?.[0];
  const href = `/dashboard/pods/${slug}/domain`;

  return (
    <div className="border-t border-border/60 py-3.5 first:border-t-0">
      <div className="flex min-h-[54px] items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Globe className="h-3.5 w-3.5" /> Custom domain
          </div>
          {isLoading ? (
            <Skeleton className="mt-1.5 h-3 w-56" />
          ) : domain ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
              <span className={`inline-flex items-center gap-1.5`}>
                <span className={`size-1.5 rounded-full ${STATUS[domain.status]?.dot ?? "bg-muted-foreground/60"}`} aria-hidden />
                <span className="font-mono font-semibold text-foreground">{domain.hostname}</span>
              </span>
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${STATUS[domain.status]?.tagCls ?? ""}`}>
                {STATUS[domain.status]?.tag ?? domain.status}
              </span>
              <span className="w-full text-muted-foreground sm:w-auto">{STATUS[domain.status]?.desc}</span>
            </div>
          ) : (
            <div className="text-[12.5px] text-muted-foreground">
              Serve this app on your own domain — e.g. <span className="font-mono">app.yourcompany.com</span>
            </div>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={href}>{domain ? "Manage" : "Set up domain…"}</Link>
        </Button>
      </div>
    </div>
  );
}
