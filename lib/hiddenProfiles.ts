/**
 * Profiles that stay fully live — they can sign in and every journey works —
 * but are hidden from all public browse surfaces: player/coach lists, the
 * Actively Looking + Featured carousels, the Recently Active marquees, and
 * coach recommendations. Use this for seed / AI / internal test accounts we
 * don't want real users to stumble on (it would break trust), while keeping
 * them usable for verifying flows.
 *
 * Their own profile page (/dashboard/player/players/[id]) is intentionally NOT
 * filtered — direct access still works so we can log in as them and check
 * journeys end to end.
 *
 * Reece Smith (Trafford FC) — non-premium test account for verifying the free
 * player experience.
 */
export const HIDDEN_PROFILE_IDS = ['bb3e7645-be4c-40ce-920e-0aa4b5519367'] as const

/**
 * Postgres in-list form for Supabase filters:
 *   query.not('id', 'in', HIDDEN_PROFILE_FILTER)
 */
export const HIDDEN_PROFILE_FILTER = `(${HIDDEN_PROFILE_IDS.join(',')})`
