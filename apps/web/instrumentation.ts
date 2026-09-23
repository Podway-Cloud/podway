// Next.js runs register() once at server startup, before any request. Nothing to do here now:
// the legacy env-var shim that used to run at this point was removed once every environment
// supplied PODWAY_* directly (zero-traces Phase 3, 2026-09-04).
export async function register(): Promise<void> {}

/**
 * Server-side crash hook — fires on uncaught errors in server components, server actions, and route
 * handlers. Reports real crashes (Telegram + wake an agent) via lib/crash-alert; ignores Next's
 * control-flow "errors" (redirect / notFound / dynamic-usage), which are NOT crashes and are common.
 */
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string; renderSource?: string },
): Promise<void> {
  // Only the Node runtime can load the control-plane/db/telegram deps; skip edge errors.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const digest = String((err as { digest?: unknown })?.digest ?? "");
  const message = err instanceof Error ? err.message : String(err);
  if (
    /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(digest) ||
    /NEXT_REDIRECT|NEXT_NOT_FOUND|DYNAMIC_SERVER_USAGE/.test(message)
  ) {
    return; // control flow, not a crash
  }
  try {
    const { reportCrash } = await import("./lib/crash-alert");
    await reportCrash({
      message,
      digest: (err as { digest?: string })?.digest,
      path: request?.path,
      kind: context?.routerKind,
    });
  } catch {
    /* instrumentation must never break a request */
  }
}
