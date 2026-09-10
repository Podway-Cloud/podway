import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { editionOss, getCurrentUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import PricingCards from "@/components/pricing-cards";
import SiteFooter from "@/components/site-footer";
import { SIGNUP_CREDIT_USD, PRICING_TIERS } from "@/lib/pricing-catalog";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, flat pricing for always-on cloud pods. Pick a size, pay one price a month.",
};

export default async function PricingPage() {
  // Pricing is a cloud concept — self-host runs on your own machine.
  if (editionOss()) notFound();
  const user = await getCurrentUser();
  const primaryHref = user ? "/dashboard" : "/signin";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-[15px] font-semibold tracking-tight">Podway</Link>
        <Button asChild variant="outline" size="sm">
          <Link href={primaryHref}>{user ? "Dashboard" : "Sign in"}</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-20">
        <section className="pt-8 pb-10 text-center sm:pt-14">
          <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">
            Keep your coding agent running from ${PRICING_TIERS[0].monthlyUsd}/month.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted-foreground sm:text-base">
            Podway gives your agent an always-on cloud machine — it keeps building while you sleep, and
            you pick up from anywhere.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <Button asChild size="lg">
              <Link href={primaryHref}>Create a pod</Link>
            </Button>
            <p className="text-[12.5px] text-muted-foreground">
              <b className="text-foreground">${SIGNUP_CREDIT_USD} in free credit</b> when you add a card.
            </p>
          </div>
        </section>

        <PricingCards />

        <p className="mt-8 text-center text-[12.5px] text-muted-foreground">
          Flat monthly pricing. No usage meters, no bandwidth charges, no surprise bills.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
