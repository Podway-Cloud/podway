// Next.js runs register() once at server startup, before any request. Nothing to do here now:
// the legacy env-var shim that used to run at this point was removed once every environment
// supplied PODWAY_* directly (zero-traces Phase 3, 2026-09-04).
export async function register(): Promise<void> {}
