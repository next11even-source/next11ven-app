'use client'

/**
 * Browser-side fetch for GET /api/performance/summary, with in-flight
 * de-duplication.
 *
 * WHY: that one route is expensive — it reads every match, every club stint and
 * the season's target, then computes the insight text (see the route's own
 * comment: "one call powers the whole tracker dashboard"). The player homepage
 * mounts two independent consumers of it, TrackerStatTile and WeekendLogBanner,
 * and each used to fire its own copy. WeekendLogBanner pays for that entire
 * payload to read a single field (`access`).
 *
 * Two components mounting in the same commit now share one request. Deliberately
 * de-duplication ONLY — there is no TTL and nothing is cached across mounts, so
 * a navigation back to a page always re-fetches and this can never serve a stale
 * summary to someone who just logged a match. That means no invalidation to wire
 * into the log flow, which is the whole point: the saving is free of correctness
 * risk. If a real cache is ever wanted here, it needs an explicit invalidate on
 * every tracker write.
 *
 * Keyed by season so the tracker's season switcher can't collide with the
 * default-season callers.
 *
 * Not to be confused with lib/performanceApi.ts — that's the server-side gate.
 */

/**
 * The route returns a wide object (lib/performance.ts owns the real per-field
 * shapes) and each caller reads only the two or three fields it renders. Rather
 * than restate the whole response here — a second copy that would silently drift
 * from the route — callers name the slice they need:
 *
 *     fetchPerformanceSummary<{ access?: string }>()
 *
 * The cast is unchecked, exactly as `await res.json()` already was at every one
 * of these call sites. This helper changes how many requests are made, not how
 * strongly the response is typed.
 */
export type PerformanceSummaryPayload = Record<string, unknown>

const inflight = new Map<string, Promise<unknown>>()

/** Resolves to the summary, or null if the request failed or is premium-locked. */
export function fetchPerformanceSummary<T = PerformanceSummaryPayload>(
  season?: number | string | null
): Promise<T | null> {
  const query = season ? `?season=${season}` : ''

  const existing = inflight.get(query)
  if (existing) return existing as Promise<T | null>

  const request = fetch(`/api/performance/summary${query}`)
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
    .finally(() => {
      inflight.delete(query)
    })

  inflight.set(query, request)
  return request as Promise<T | null>
}
