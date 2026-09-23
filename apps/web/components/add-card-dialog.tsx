"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  LinkAuthenticationElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { startAddCard, markCardSaved } from "@/lib/billing-actions";
import { SIGNUP_CREDIT_USD } from "@/lib/pricing-catalog";

/** loadStripe returns a promise; cache one per publishable key so Elements isn't re-created. */
const stripeCache = new Map<string, Promise<Stripe | null>>();
function stripeFor(pubKey: string): Promise<Stripe | null> {
  let p = stripeCache.get(pubKey);
  if (!p) {
    p = loadStripe(pubKey);
    stripeCache.set(pubKey, p);
  }
  return p;
}

/**
 * "Add card" (or "Update card") — opens a dialog that saves a card via a Stripe SetupIntent. The card
 * number is entered in Stripe's own iframe (PaymentElement), so it never touches our servers. On
 * success we mark the card on file and refresh.
 */
export default function AddCardButton({ hasCard }: { hasCard: boolean }) {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<{ clientSecret: string; pubKey: string; email: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function begin() {
    setError(null);
    setSetup(null);
    setOpen(true);
    setLoading(true);
    const r = await startAddCard();
    setLoading(false);
    if ("error" in r) setError(r.error);
    else setSetup(r);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={begin}>
        {hasCard ? "Update card" : "Add card"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasCard ? "Update your card" : "Add a card"}</DialogTitle>
            <DialogDescription>
              Your card is stored securely by Stripe — the number never touches Podway.
            </DialogDescription>
          </DialogHeader>
          {!hasCard && (
            <p
              role="note"
              className="rounded-lg border border-success/35 bg-success/10 px-3 py-2 text-[12.5px] text-success"
            >
              ${SIGNUP_CREDIT_USD} free credit activates once your card is saved.
            </p>
          )}
          {error ? (
            <p className="text-[13.5px] text-destructive">{error}</p>
          ) : loading || !setup ? (
            <p className="text-[13.5px] text-muted-foreground" role="status">Preparing secure form…</p>
          ) : (
            <Elements stripe={stripeFor(setup.pubKey)} options={{ clientSecret: setup.clientSecret }}>
              <CardForm email={setup.email} onDone={() => setOpen(false)} />
            </Elements>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CardForm({ email, onDone }: { email: string; onDone: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    // Save the card without leaving the page — no redirect for a plain card.
    const { error: err } = await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (err) {
      setError(err.message ?? "Couldn't save the card.");
      setSubmitting(false);
      return;
    }
    await markCardSaved();
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* Stripe Link one-click: the pre-filled email lets Link recognise a returning member and
          offer their saved cards, so paying is a single tap. Falls back to the normal card fields. */}
      <LinkAuthenticationElement options={{ defaultValues: { email } }} />
      <PaymentElement />
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      <Button type="submit" disabled={!stripe || submitting} className="self-end">
        {submitting ? "Saving…" : "Save card"}
      </Button>
    </form>
  );
}
