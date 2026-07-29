/**
 * Player height — canonical values + a parser for the free-text era.
 *
 * Height was a free-text box until now, which produced 214 values in formats
 * including 5'11, 6’2 (curly quote), 6,1, 5 9, 6ft 1, "6 foot " and a bare 52.
 * None of it is sortable or filterable, which is the whole point of asking.
 *
 * Going forward the forms write a canonical string from HEIGHT_OPTIONS.
 * parseHeight() maps the legacy values onto the same set so existing profiles
 * still select correctly in the dropdown — no backfill migration needed, and
 * a value we can't parse is left alone rather than destroyed.
 */

const MIN_INCHES = 4 * 12 + 6  // 4'6"
const MAX_INCHES = 7 * 12      // 7'0"

/** Canonical display form for a height in inches: 5'11" */
export function inchesToHeight(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

/** Rounded cm, for the dropdown label only — we store the imperial string. */
export function inchesToCm(inches: number): number {
  return Math.round(inches * 2.54)
}

/** Every selectable height, shortest first. */
export const HEIGHT_OPTIONS: { value: string; label: string; inches: number }[] =
  Array.from({ length: MAX_INCHES - MIN_INCHES + 1 }, (_, i) => {
    const inches = MIN_INCHES + i
    const value = inchesToHeight(inches)
    return { value, label: `${value}  (${inchesToCm(inches)}cm)`, inches }
  })

const VALID = new Set(HEIGHT_OPTIONS.map(o => o.value))

/**
 * Best-effort parse of a stored height into total inches.
 * Handles the legacy formats above plus plain cm. Returns null if it can't be
 * read with confidence — better to show nothing than to invent a number.
 */
export function heightToInches(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null

  const inRange = (n: number) => (n >= MIN_INCHES && n <= MAX_INCHES ? n : null)

  // Normalise the assorted quote characters people typed. Note that a curly ”
  // is used as a FEET mark as often as a straight ' here (6”2 means 6'2"), so
  // both are treated as separators below rather than as an inches marker.
  const s = raw.trim().toLowerCase()
    .replace(/[’‘´`]/g, "'")
    .replace(/[”“]/g, '"')
    .replace(/''/g, '"')
    .replace(/\band a? ?half\b/g, '.5')
    .replace(/\s*(?:ft|feet|foot)\s*$/, '')   // trailing unit: "6'0ft"
    .trim()

  // Metric written as metres: 1m90, 1.98, 1,98
  const m = s.match(/^1\s*[m.,]\s*(\d{1,2})$/)
  if (m) {
    const cmValue = 100 + Number(m[1].padEnd(2, '0'))
    return inRange(Math.round(cmValue / 2.54))
  }

  // Centimetres: 180cm, 180 cm, or a bare number in a plausible cm range
  const cm = s.match(/^(\d{3})\s*cm$/) ?? s.match(/^(1[4-9]\d|2[0-2]\d)$/)
  if (cm) return inRange(Math.round(Number(cm[1]) / 2.54))

  // Feet and inches. Separator may be ' " , . : ft/feet/foot or whitespace.
  // Inches may carry a decimal (6ft 2.5) which we round to the nearest inch.
  const ft = s.match(/^(\d)\s*(?:'|"|,|\.|:|ft|feet|foot|\s)\s*(\d{1,2}(?:\.\d+)?)?\s*(?:"|in|inch|inches)?$/)
  if (ft) {
    const inch = ft[2] ? Math.round(Number(ft[2])) : 0
    if (inch > 11) return null
    return inRange(Number(ft[1]) * 12 + inch)
  }

  // Bare feet: "6"
  if (/^[4-7]$/.test(s)) return inRange(Number(s) * 12)

  // Bare inches: "72". Floored at 5'0" — anything lower is far likelier to be
  // a typo than a real player, and we'd rather return nothing than a wrong number.
  if (/^\d{2}$/.test(s)) {
    const n = Number(s)
    return n >= 60 ? inRange(n) : null
  }

  return null
}

/**
 * Canonical height string, or null when the input can't be parsed.
 * Use when hydrating a form so a legacy value pre-selects in the dropdown.
 */
export function parseHeight(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  if (VALID.has(raw.trim())) return raw.trim()
  const inches = heightToInches(raw)
  return inches === null ? null : inchesToHeight(inches)
}

/**
 * What to show on a profile. Falls back to the raw stored string for the
 * handful of legacy values we can't parse — displaying "6 foot" is better than
 * displaying nothing, even though it won't sort.
 */
export function displayHeight(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  return parseHeight(raw) ?? raw.trim()
}
