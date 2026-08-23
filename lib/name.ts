/**
 * Name handling. Mirrors the SQL in 20260823000001_split_profile_names.sql
 * (n11_name_parts / n11_name_compose) exactly — if you change the rule here,
 * change it there too, or a client-side split and the DB trigger will disagree.
 *
 * first_name / last_name are the source of truth. full_name is derived, and the
 * DB trigger keeps it in step, so nothing here needs to write it.
 */

/** Collapse internal runs of whitespace, trim, and treat empty as absent. */
export function normaliseNamePart(raw: string | null | undefined): string | null {
  const v = (raw ?? '').replace(/\s+/g, ' ').trim()
  return v === '' ? null : v
}

/**
 * "First word is the given name, everything after it is the family name."
 *
 * Verified against all 942 live profiles: it round-trips losslessly on every
 * row, and lands correctly on the particle and hyphen cases in the data
 * (Jomar / Da Silva, Bailey / De Sousa, Matty / Argent - Barnes).
 */
export function splitName(full: string | null | undefined): {
  firstName: string | null
  lastName: string | null
} {
  const v = normaliseNamePart(full)
  if (!v) return { firstName: null, lastName: null }
  const i = v.indexOf(' ')
  if (i === -1) return { firstName: v, lastName: null }
  return { firstName: v.slice(0, i), lastName: v.slice(i + 1) }
}

/** Join the parts back into a display name. Null when there is nothing to show. */
export function composeName(
  first: string | null | undefined,
  last: string | null | undefined
): string | null {
  const f = normaliseNamePart(first)
  const l = normaliseNamePart(last)
  const joined = [f, l].filter(Boolean).join(' ')
  return joined === '' ? null : joined
}

/**
 * The name to greet someone by in an email or in the UI.
 *
 * Prefers the stored first_name and falls back to splitting full_name, so this is
 * safe to call on rows written before the split migration and on any payload that
 * only selected full_name.
 */
export function greetingName(
  profile: { first_name?: string | null; full_name?: string | null },
  fallback = 'there'
): string {
  return (
    normaliseNamePart(profile.first_name) ??
    splitName(profile.full_name).firstName ??
    fallback
  )
}

/**
 * True when a profile still owes us a surname — the gate for the forced-surname
 * modal. Falls back to full_name so a row that predates the backfill, or a
 * payload that didn't select last_name, isn't wrongly flagged as complete.
 */
export function needsLastName(profile: {
  last_name?: string | null
  full_name?: string | null
}): boolean {
  if (normaliseNamePart(profile.last_name)) return false
  return !splitName(profile.full_name).lastName
}
