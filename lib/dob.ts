/**
 * Date-of-birth bounds — single source of truth for the signup, conversion and
 * profile-edit forms plus their API routes. Keep client and server in step.
 *
 * MIN_AGE is 16, not 18: the platform has 44 legitimate 16–17 year olds on it,
 * so an 18 floor would lock out real members. 16 is the point below which we
 * shouldn't be taking a registration unsupervised.
 *
 * MAX_AGE guards typos rather than people — the audit found members with a DOB
 * in the current year (age 0) and a year of `0008`. The oldest plausible member
 * on file is 91, so 100 is comfortably clear of anyone real.
 */
export const MIN_AGE = 16
export const MAX_AGE = 100

/** Age in whole years on `on` (default: now). Null if unparseable. */
export function ageFromDob(dob: string | null | undefined, on: Date = new Date()): number | null {
  if (!dob?.trim()) return null
  const d = new Date(dob)
  if (isNaN(d.getTime())) return null
  let age = on.getFullYear() - d.getFullYear()
  const m = on.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && on.getDate() < d.getDate())) age--
  return age
}

/** `min`/`max` for a <input type="date">, as yyyy-mm-dd. */
export function dobBounds(on: Date = new Date()): { min: string; max: string } {
  const at = (yearsAgo: number) => {
    const d = new Date(on)
    d.setFullYear(d.getFullYear() - yearsAgo)
    return d.toISOString().slice(0, 10)
  }
  return { min: at(MAX_AGE), max: at(MIN_AGE) }
}

/**
 * Server-side check. Returns an error message, or null when acceptable.
 * An absent DOB is allowed — it isn't a required field; this only rejects a
 * value that IS supplied and is out of range.
 */
export function validateDob(dob: string | null | undefined): string | null {
  if (!dob?.trim()) return null
  const age = ageFromDob(dob)
  if (age === null) return 'Enter a valid date of birth.'
  if (age < MIN_AGE) return `You must be at least ${MIN_AGE} to join NEXT11VEN.`
  if (age > MAX_AGE) return 'Check your date of birth — that date looks incorrect.'
  return null
}

export const DOB_HELP = `You must be ${MIN_AGE} or over to join.`
