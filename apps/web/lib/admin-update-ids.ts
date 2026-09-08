/**
 * Validation + normalization for the admin bulk pod-image update endpoint (`/api/admin/pods/update`).
 *
 * Kept separate from the route so it is unit-testable without a route harness or the control-plane
 * dependency the route pulls in.
 *
 * R.2 (docs/plans/ui-responsiveness-and-scale.md): the endpoint used to REJECT any request with more
 * than 24 ids, which forced a caller migrating a fleet larger than 24 to split the list by hand. That
 * cap was never what protects the box — the route already recreates pods ONE AT A TIME in the
 * background, and `admission.ts` is the global bound on concurrent recreates. So the count limit here
 * is only an abuse guard against a pathological payload, not a fleet-size ceiling: a whole fleet (up
 * to MAX_IDS) is now accepted in one call and paced by the sequential loop.
 */

/** Upper bound on ids per call. NOT a box-load limit (the sequential recreate loop + admission gate
 * are) — just a sanity ceiling so one request can't enqueue an unbounded set. Comfortably above any
 * realistic fleet while still bounding a bad payload. */
export const MAX_IDS = 200;

export type NormalizedUpdateIds = { ids: string[] } | { error: string; status: number };

/** Parse and validate the `ids` from a request body. Dedupes (a repeated id would otherwise be
 * queued and recreated twice), drops non-string/empty entries, and enforces the abuse ceiling. */
export function normalizeUpdateIds(rawIds: unknown): NormalizedUpdateIds {
  if (!Array.isArray(rawIds)) {
    return { error: "body must be JSON: { ids: string[] }", status: 400 };
  }
  const ids = [...new Set(rawIds.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (ids.length === 0) return { error: "ids[] required", status: 400 };
  if (ids.length > MAX_IDS) return { error: `at most ${MAX_IDS} ids per call`, status: 400 };
  return { ids };
}
