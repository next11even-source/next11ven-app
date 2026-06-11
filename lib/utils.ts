/**
 * Shared utility functions used across the app.
 */

/** Capitalises the first letter of every word. "jamal crawford" → "Jamal Crawford" */
export function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
}

/**
 * Normalises a UK phone number to E.164 format (+447xxxxxxxxx).
 * Handles: 07xxx, +44 7xxx, 447xxx, 0044xxx, 7xxx (10 digits), spaces/dashes/parens.
 * Returns null for empty input or unrecognisable formats.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  // Strip spaces, dashes, dots, parentheses
  let s = raw.replace(/[\s\-().]/g, '')
  // Convert legacy 0044 international prefix
  if (s.startsWith('0044')) s = '+44' + s.slice(4)
  // Extract digits only (preserve + position)
  const hasPlus = s.startsWith('+')
  const digits = s.replace(/\D/g, '')
  // 07xxxxxxxxx (11 digits)
  if (digits.startsWith('07') && digits.length === 11) return '+44' + digits.slice(1)
  // 7xxxxxxxxx (10 digits, no leading 0 or country code)
  if (digits.startsWith('7') && digits.length === 10) return '+44' + digits
  // 447xxxxxxxxx (12 digits, country code no +)
  if (digits.startsWith('447') && digits.length === 12) return '+' + digits
  // +44xxxxxxxxxx already formed
  if (hasPlus && digits.startsWith('44') && digits.length === 12) return '+' + digits
  // Unrecognised — don't save garbage
  return null
}

export function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
