/**
 * Shared utility functions used across the app.
 */

/** Capitalises the first letter of every word. "jamal crawford" → "Jamal Crawford" */
export function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
}

export function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
