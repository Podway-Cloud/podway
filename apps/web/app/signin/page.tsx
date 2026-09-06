import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createAppDb } from "@podway/db";
import SignInForm from "@/components/signin-form";
import { getCurrentUser, editionOss } from "@/lib/session";
import { ownerCredentialExists, resolveOwnerEmail } from "@/lib/auth-config";
import { resolveSignInCallback } from "@/lib/signin-callback";
import styles from "./signin.module.css";

/** The owner's login email in OSS (self-host-auth-gate) — pre-filled so the owner mostly types a
 * password. Overridable so a non-default email can be used. */
// A valid-FORMAT default (better-auth's email validator rejects `owner@localhost` — no dot in the
// domain). `.local` is a non-routable convention; the owner can change it to their real email.
// Used ONLY for a first-run setup where no owner exists yet: once one does, the form pre-fills the
// address that owner actually signed up with (see resolveOwnerEmail). Otherwise renaming this
// default would have shown an existing owner the wrong address and a failed login.
const OSS_OWNER_EMAIL_DEFAULT = process.env.PODWAY_AUTH_EMAIL || "owner@podway.local";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in to Podway",
  description: "Sign in with GitHub to request private-alpha access or return to your projects.",
};

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = resolveSignInCallback(next);
  // Already signed in → nothing to do here; honor the callback target (defaults
  // to /dashboard). ONLY /signin does this — the landing (/) stays viewable
  // while signed in (the CTA swap covers it), so iterating on landing copy
  // never requires logging out.
  if (await getCurrentUser()) redirect(safeNext);
  // OSS (self-host-auth-gate): decide first-run SETUP vs normal LOGIN — is there an owner
  // credential yet? Cloud keeps its GitHub button (oss=false).
  const oss = editionOss();
  // Two questions, one db handle. ownerExists stays gated on the PASSWORD CREDENTIAL exactly as
  // before — deriving it from the email lookup instead would flip a real owner to "first-run setup"
  // if their user row were ever missing, which is a worse failure than a wrong pre-fill.
  // The pre-fill reads the REAL email so it matches the account rather than a default that may
  // predate a rename, and an owner who chose a custom address finally sees it.
  const db = oss ? createAppDb() : null;
  const ownerExists = db ? await ownerCredentialExists(db) : true;
  const ownerEmail = (db ? await resolveOwnerEmail(db) : null) ?? OSS_OWNER_EMAIL_DEFAULT;
  return (
    <main className={styles.page}>
      <section className={styles.surface} aria-labelledby="signin-title">
        <div className={styles.signinPanel}>
          <header className={styles.panelHeader}>
            <Link className={styles.brand} href="/" aria-label="Podway home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.brandMark} src="/podway-mark.svg" alt="" />
              <span className={styles.wordmark}><span>pod</span>way</span>
            </Link>
            <Link className={styles.backLink} href="/"><span aria-hidden>←</span> Back to home</Link>
          </header>
          <div className={styles.formPosition}>
            <SignInForm next={safeNext} oss={oss} ownerExists={ownerExists} ownerEmail={ownerEmail} />
          </div>
        </div>
      </section>
    </main>
  );
}
