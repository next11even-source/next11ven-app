// Single source of truth for profile completion scoring.
// Used by player homepage and player profile page — keep in sync.

export type CompletionProfile = {
  avatar_url?: string | null
  position?: string | null
  club?: string | null
  city?: string | null
  status?: string | null
  phone?: string | null
  date_of_birth?: string | null
  foot?: string | null
  height?: string | null
  playing_level?: string | null
  highlight_urls?: string[] | null
  goals?: number
  assists?: number
  appearances?: number
}

export const COMPLETION_CHECKS: { label: string; done: (p: CompletionProfile) => boolean }[] = [
  { label: 'Profile photo',  done: p => !!p.avatar_url },
  { label: 'Position',       done: p => !!p.position },
  { label: 'Club',           done: p => !!p.club },
  { label: 'Location',       done: p => !!p.city },
  { label: 'Availability',   done: p => !!p.status },
  { label: 'Phone number',   done: p => !!p.phone },
  { label: 'Date of birth',  done: p => !!p.date_of_birth },
  { label: 'Strongest foot', done: p => !!p.foot },
  { label: 'Height',         done: p => !!p.height },
  { label: 'Playing level',  done: p => !!p.playing_level },
  { label: 'Highlight reel', done: p => Array.isArray(p.highlight_urls) && p.highlight_urls.length > 0 },
  { label: 'Season stats',   done: p => (p.goals ?? 0) > 0 || (p.assists ?? 0) > 0 || (p.appearances ?? 0) > 0 },
]

export function calcCompletion(profile: CompletionProfile): { pct: number; missing: string[] } {
  const results = COMPLETION_CHECKS.map(c => ({ label: c.label, isDone: c.done(profile) }))
  const filled = results.filter(r => r.isDone).length
  const pct = Math.round((filled / results.length) * 100)
  const missing = results.filter(r => !r.isDone).map(r => r.label)
  return { pct, missing }
}
