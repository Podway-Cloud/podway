"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { track } from "@/lib/track";
import styles from "@/app/signin/signin.module.css";

/** A strong, copy-pasteable password from the browser CSPRNG (no ambiguous chars). */
function generatePassword(len = 20): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_";
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export default function SignInForm({
  next,
  oss = false,
  ownerExists = true,
  ownerEmail = "owner@localhost",
  hasGoogle = false,
}: {
  next: string;
  /** Self-host edition: email+password owner instead of the GitHub button. */
  oss?: boolean;
  /** OSS only: does an owner credential exist yet? false ⇒ first-run SETUP, true ⇒ LOGIN. */
  ownerExists?: boolean;
  /** OSS only: the owner's login email (pre-filled). */
  ownerEmail?: string;
  /** Cloud: also offer "Continue with Google" (only when Google OAuth is configured). */
  hasGoogle?: boolean;
}) {
  if (oss) {
    return <OwnerForm next={next} setup={!ownerExists} ownerEmail={ownerEmail} />;
  }
  return <CloudForm next={next} hasGoogle={hasGoogle} />;
}

/** GitHub octocat mark (inherits the button's text colour). */
function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Google multicolour "G" (per the Sign in with Google button guidance). */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

/** Cloud: social sign-in — GitHub, plus Google when it's configured. */
function CloudForm({ next, hasGoogle }: { next: string; hasGoogle: boolean }) {
  const [busy, setBusy] = useState<null | "github" | "google">(null);
  const [error, setError] = useState<string | null>(null);
  const label = (p: "github" | "google") => (p === "github" ? "GitHub" : "Google");

  async function start(provider: "github" | "google") {
    if (busy) return;
    setBusy(provider);
    setError(null);
    track("sign_in_initiated", { provider });
    try {
      const result = await authClient.signIn.social({ provider, callbackURL: next });
      if (result.error) {
        setError(`${label(provider)} sign-in could not start. Please try again.`);
        setBusy(null);
      }
    } catch {
      setError(`${label(provider)} sign-in could not start. Please try again.`);
      setBusy(null);
    }
  }

  return (
    <div className={styles.authContent}>
      <p className={styles.eyebrow}>Private alpha</p>
      <h1 id="signin-title">Sign in to Podway</h1>
      <p className={styles.intro}>
        Use {hasGoogle ? "GitHub or Google" : "GitHub"} to request access or return to your projects.
      </p>

      <div className={styles.oauthButtons} aria-busy={Boolean(busy)}>
        <button
          className={`${styles.oauthButton} ${styles.oauthGithub}`}
          type="button"
          disabled={Boolean(busy)}
          onClick={() => start("github")}
        >
          <GithubIcon />
          <span>{busy === "github" ? "Connecting to GitHub…" : "Continue with GitHub"}</span>
        </button>
        {hasGoogle && (
          <button
            className={`${styles.oauthButton} ${styles.oauthGoogle}`}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => start("google")}
          >
            <GoogleIcon />
            <span>{busy === "google" ? "Connecting to Google…" : "Continue with Google"}</span>
          </button>
        )}
      </div>

      <div className={styles.authOutcome}>
        <strong>What happens next</strong>
        <p>
          Approved accounts continue to the Podway dashboard. New requests join the private-alpha
          queue.
        </p>
      </div>

      <p className={styles.identityNote}>
        {hasGoogle ? "GitHub or Google" : "GitHub"} signs you into Podway. Repository access and
        Claude or Codex sign-in stay separate.
      </p>

      <p className={styles.error} aria-live="polite">{error}</p>
    </div>
  );
}

/** Self-host: first-run owner SETUP or normal LOGIN (email + password). */
function OwnerForm({ next, setup, ownerEmail }: { next: string; setup: boolean; ownerEmail: string }) {
  const [email, setEmail] = useState(ownerEmail);
  const [password, setPassword] = useState("");
  const [generated, setGenerated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setPassword(generatePassword());
    setGenerated(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = setup
        ? await authClient.signUp.email({ email, password, name: "Owner", callbackURL: next })
        : await authClient.signIn.email({ email, password, callbackURL: next });
      if (result.error) {
        setError(
          setup
            ? result.error.message || "Could not create the owner. Is one already set up?"
            : "Incorrect email or password.",
        );
        setBusy(false);
        return;
      }
      // Cookie is set by better-auth; go to the requested destination.
      window.location.assign(next);
    } catch {
      setError(setup ? "Could not create the owner." : "Sign-in failed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.authContent}>
      <p className={styles.eyebrow}>Self-host</p>
      <h1 id="signin-title">{setup ? "Set up your owner account" : "Sign in"}</h1>
      <p className={styles.intro}>
        {setup
          ? "Create the single owner for this install. Choose a password or generate a strong one."
          : "Enter your owner password to continue."}
      </p>

      <form className={styles.authForm} onSubmit={submit} aria-busy={busy}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="owner-email">Email</label>
          <input
            id="owner-email"
            className={styles.input}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="owner-password">Password</label>
          <input
            id="owner-password"
            className={styles.input}
            // When generated, show it so the owner can copy it; otherwise mask.
            type={setup && generated ? "text" : "password"}
            autoComplete={setup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setGenerated(false);
            }}
            minLength={8}
            required
          />
          {setup && (
            <div className={styles.generateRow}>
              <button type="button" className={styles.linkButton} onClick={generate} disabled={busy}>
                Generate a strong password
              </button>
            </div>
          )}
          {setup && generated && (
            <p className={styles.generatedNote}>
              Copy this password and store it somewhere safe — this install can’t email you a reset.
            </p>
          )}
        </div>

        <button className={styles.githubButton} type="submit" disabled={busy}>
          {busy
            ? setup
              ? "Creating owner…"
              : "Signing in…"
            : setup
              ? "Create owner & continue"
              : "Sign in"}
        </button>
      </form>

      <p className={styles.error} aria-live="polite">{error}</p>
    </div>
  );
}
