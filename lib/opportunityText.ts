// Shared opportunity title formatting — used by the Open Roles feed and the
// homepage preview so a coach-entered ALL CAPS title reads the same way on
// both surfaces.

// Football position / club abbreviations that should stay uppercase when a
// free-text title is converted to sentence case.
const KNOWN_ACRONYMS = new Set([
  'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST',
  'FC', 'AFC', 'U18', 'U21', 'U23',
])

// Coach-entered titles are often ALL CAPS free text. Convert to sentence case
// for display only (never mutates stored data), preserving known position /
// club acronyms and any punctuation (including em dashes) untouched.
export function toSentenceCase(text: string): string {
  if (!text) return text
  return text.split(' ').map((word, i) => {
    const core = word.replace(/[^A-Za-z0-9]/g, '')
    if (core.length > 1 && KNOWN_ACRONYMS.has(core.toUpperCase())) return word.toUpperCase()
    const lower = word.toLowerCase()
    if (i === 0 && lower) return lower.charAt(0).toUpperCase() + lower.slice(1)
    return lower
  }).join(' ')
}
