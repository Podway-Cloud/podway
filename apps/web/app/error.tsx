"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Branded route error boundary — replaces Next's default "Application error occurred" with a retry
 * and a reportable digest, AND reports the crash to PostHog so it's queryable and linked to the
 * session replay (the digest ties it back to the server log that carries the real message).
 *
 * Layout: uses `.center` (the auth-page centering wrapper) — NOT `.shell`, which has no global CSS,
 * so the card used to sit unstyled at the top-left. Actions stack vertically because `.gh` is
 * width:100% — three in a row got squeezed and their labels wrapped.
 *
 * Special-cases DEPLOY SKEW: after a deploy, a tab loaded from the old build sends a stale
 * server-action id, which the new server rejects ("Server Action … was not found"). Next's soft
 * reset() keeps the stale JS, so it'd fail again — only a FULL reload pulls a fresh bundle.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to PostHog (best-effort; no-ops if PostHog isn't loaded — self-host, consent declined).
    try {
      const props = {
        digest: error?.digest,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
        message: error?.message,
      };
      const ph = posthog as unknown as {
        captureException?: (e: unknown, p?: Record<string, unknown>) => void;
        capture?: (n: string, p?: Record<string, unknown>) => void;
      };
      if (typeof ph.captureException === "function") ph.captureException(error, props);
      else ph.capture?.("$exception", props);
    } catch {
      /* never let telemetry break the error page */
    }
  }, [error]);

  const deploySkew = /server action|failed to find|was not found|deployment/i.test(
    error?.message ?? "",
  );

  return (
    <main className="center">
      <div className="card auth" style={{ width: 380 }}>
        <span className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-mark" src="/podway-mark.svg" alt="Podway" />
          <span className="wordmark">
            <span className="pod">pod</span>
            <span className="way">way</span>
          </span>
        </span>
        {deploySkew ? (
          <>
            <h1>Podway was updated</h1>
            <p className="muted">
              A new version was deployed while this page was open, so that action expired. Reload to
              pick up the latest and continue — nothing was lost.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
              <button className="gh" onClick={() => window.location.reload()}>
                Reload
              </button>
              <a className="pill" style={{ textAlign: "center" }} href="/dashboard">
                Back to dashboard
              </a>
            </div>
          </>
        ) : (
          <>
            <h1>Something went wrong</h1>
            <p className="muted">
              An unexpected error occurred. Try again — if it keeps happening, send us the code below
              and we&rsquo;ll dig in.
            </p>
            {error.digest && (
              <p className="muted" style={{ fontFamily: "ui-monospace, monospace" }}>
                error code: {error.digest}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
              <button className="gh" onClick={() => reset()}>
                Try again
              </button>
              <button className="gh secondary" onClick={() => window.location.reload()}>
                Reload page
              </button>
              <a className="pill" style={{ textAlign: "center" }} href="/dashboard">
                Back to dashboard
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
