/**
 * Nearest-city field — canonical UK city list + a parser for the free-text era.
 *
 * City was a free-text box until now. Live data (19 Aug 2026) showed 78
 * distinct values behind 899 filled profiles, almost all of it near-duplicates
 * (`Manchester` / `manchester` / `ALTRINCHAM`), small towns fragmenting off a
 * big one (`Altrincham`, `Northwich`, `Salford` — all effectively Manchester
 * for a "players near you" filter), or outright multi-value junk
 * (`cheshire/ northwich / manchester`, `Sheffield, Manchester, Nottingham`,
 * `Leeds or Manchester`). None of it groups usefully, which is the whole
 * point of asking.
 *
 * Going forward the forms write a canonical string from CITY_OPTIONS.
 * parseCity() maps legacy free text onto the same set (case-insensitive,
 * known synonyms, and best-effort first-match on multi-value strings) so
 * existing profiles still pre-select correctly in the dropdown — no backfill
 * migration needed, and a value we can't confidently place is left as an
 * empty selection rather than guessed.
 *
 * Deliberately generic, per founder call: only major cities/large towns are
 * listed. Satellite towns collapse into their nearest entry (Oldham, Salford,
 * Trafford, Stockport, Rochdale, Bury → Manchester) rather than each getting
 * its own option, so "near me" filtering stays meaningful as the platform
 * grows rather than fragmenting into every borough/village.
 */

export const CITY_OPTIONS = [
  'Bath', 'Birmingham', 'Blackburn', 'Blackpool', 'Bolton', 'Bournemouth',
  'Bradford', 'Brighton', 'Bristol', 'Cambridge', 'Canterbury', 'Carlisle',
  'Chelmsford', 'Chester', 'Colchester', 'Coventry', 'Derby', 'Doncaster',
  'Durham', 'Exeter', 'Gloucester', 'Huddersfield', 'Hull', 'Ipswich',
  'Lancaster', 'Leeds', 'Leicester', 'Lincoln', 'Liverpool', 'London',
  'Luton', 'Manchester', 'Middlesbrough', 'Milton Keynes',
  'Newcastle upon Tyne', 'Northampton', 'Norwich', 'Nottingham', 'Oxford',
  'Peterborough', 'Plymouth', 'Portsmouth', 'Preston', 'Reading',
  'Sheffield', 'Southampton', 'Southend-on-Sea', 'Stoke-on-Trent',
  'Sunderland', 'Wakefield', 'Wigan', 'Wolverhampton', 'Worcester', 'York',
  'Bangor', 'Cardiff', 'Newport', 'Swansea', 'Wrexham',
  'Aberdeen', 'Dundee', 'Edinburgh', 'Glasgow',
  'Belfast', 'Derry',
  'Dublin', 'Cork',
  'Other',
] as const

export type City = typeof CITY_OPTIONS[number]

const VALID = new Set<string>(CITY_OPTIONS)
const LOWER_TO_CANONICAL = new Map(CITY_OPTIONS.map(c => [c.toLowerCase(), c] as [string, City]))

// Legacy spellings/variants seen in the data that don't just differ by case.
const ALIASES: Record<string, City> = {
  'newcastle': 'Newcastle upon Tyne',
  'stoke on trent': 'Stoke-on-Trent',
  'kingston upon hull': 'Hull',
  'southend': 'Southend-on-Sea',
  'londonderry': 'Derry',
}

function matchToken(token: string): City | null {
  const t = token.trim().toLowerCase()
  if (!t) return null
  return LOWER_TO_CANONICAL.get(t) ?? ALIASES[t] ?? null
}

/**
 * Best-effort parse of a stored/typed city into a canonical CITY_OPTIONS
 * value. Handles case variants, known synonyms, and multi-value legacy
 * strings ("Sheffield, Manchester, Nottingham", "Leeds or Manchester") by
 * returning the first recognised token found. Returns null when nothing in
 * the string matches a known city — better to show an empty selection than
 * to invent one.
 */
export function parseCity(raw: string | null | undefined): City | null {
  if (!raw?.trim()) return null
  const direct = matchToken(raw)
  if (direct) return direct
  for (const token of raw.split(/,|\/|\||\bor\b|\band\b/i)) {
    const match = matchToken(token)
    if (match) return match
  }
  return null
}

/** True when the value is one of CITY_OPTIONS exactly — for server-side validation. */
export function isValidCity(value: string | null | undefined): value is City {
  return !!value && VALID.has(value)
}
