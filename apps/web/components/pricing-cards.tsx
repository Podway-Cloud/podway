import { Check } from "lucide-react";
import { PRICING_TIERS, INCLUDED_FEATURES, SUSPENDED_USD } from "@/lib/pricing-catalog";
import { cn } from "@/lib/utils";

/**
 * The size ladder as pricing cards. Presentational + reusable — the public /pricing page and the
 * dashboard billing view both render it. Prices come from the pricing catalog (cloud only).
 */
export default function PricingCards({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-2 lg:grid-cols-5")}>
        {PRICING_TIERS.map((t) => {
          const featured = t.tag === "default";
          return (
            <div
              key={t.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-4",
                featured ? "border-primary/60 ring-1 ring-primary/30" : "border-border",
              )}
            >
              {t.tag === "default" && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-primary px-2 py-0.5 text-[10.5px] font-semibold text-primary-foreground">
                  Most popular
                </span>
              )}
              {t.tag === "light" && (
                <span className="absolute -top-2.5 left-4 rounded-full border border-border bg-muted px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                  Light
                </span>
              )}
              <div className="text-[15px] font-semibold">{t.name}</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold tabular-nums tracking-tight">${t.monthlyUsd}</span>
                <span className="text-[12.5px] text-muted-foreground">/mo</span>
              </div>
              <p className="mt-1.5 min-h-[34px] text-[12.5px] text-muted-foreground">{t.blurb}</p>
              <dl className="mt-3 flex flex-col gap-1 border-t border-border/60 pt-3 text-[12.5px] tabular-nums">
                <div className="flex justify-between"><dt className="text-muted-foreground">RAM</dt><dd className="font-medium">{t.ramGb} GB</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">vCPU</dt><dd className="font-medium">{t.vcpu} <span className="text-muted-foreground">burst</span></dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Disk</dt><dd className="font-medium">{t.diskGb} GB</dd></div>
              </dl>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 rounded-2xl border border-border bg-card/60 p-5 sm:grid-cols-2">
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">Every pod includes</h3>
          <ul className="mt-3 grid gap-2">
            {INCLUDED_FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-[13.5px]">
                <Check className="size-4 shrink-0 text-success" aria-hidden /> {f}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-3 text-[13.5px]">
          <div className="rounded-xl border border-border bg-muted/40 p-3.5">
            <div className="font-semibold text-foreground">Pause anytime for ${SUSPENDED_USD}/mo</div>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              Suspend a pod and it drops to ${SUSPENDED_USD}/mo — we keep your disk safe and free up the rest.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
