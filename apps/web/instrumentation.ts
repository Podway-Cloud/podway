// Next.js runs register() once at server startup, before any request. Nothing to do here now:
// the legacy env-var shim that used to run at this point was removed once every environment
// supplied PODWAY_* directly (zero-traces Phase 3, 2026-09-04).
export async function register(): Promise<void> {}

/**
 * Server-side crash hook — fires on uncaught errors in server components, server actions, route
 * handlers, and middleware. It stays EDGE-SAFE (middleware is edge, so this module is edge-compiled):
 * it does NOT import the pg/control-plane deps — it POSTs the crash to an internal nodejs route
 * (`/api/internal/crash`, secret-guarded) which does the Telegram + wake-an-agent work. Ignores
 * Next's control-flow "errors" (redirect / notFound / dynamic-usage), which are NOT crashes.
 */
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string; headers?: Record<string, string> },
  context: { routerKind?: string; routePath?: string; renderSource?: string },
): Promise<void> {
  const digest = String((err as { digest?: unknown })?.digest ?? "");
  const message = err instanceof Error ? err.message : String(err);
  if (
    /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest) ||
    /NEXT_REDIRECT|NEXT_NOT_FOUND|DYNAMIC_SERVER_USAGE/.test(message)
  ) {
    return; // control flow, not a crash
  }
  const secret = process.env.PODWAY_CRASH_HOOK_SECRET;
  const host = request?.headers?.host;
  if (!secret || !host) return; // unconfigured → no-op
  try {
    await fetch(`https://${host}/api/internal/crash`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-crash-secret": secret },
      body: JSON.stringify({
        message,
        digest: (err as { digest?: string })?.digest,
        path: request?.path,
        kind: context?.routerKind,
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    /* best-effort — instrumentation must never break a request */
  }
}
