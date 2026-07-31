// Single source of truth for profile completion scoring.
// Used by player homepage and player profile page — keep in sync.
//
// ORDER IS THE RANKING. Checks are listed most-valuable first, and the
// completion bar names the first unfinished one, so this array decides what we
// ask people for. It is sorted by what actually costs a player opportunities,
// which is not the same as what's cheapest to fill in:
//   - Photo first. 52% of players have none, and a profile without a face is
//     the one a coach scrolls past. Biggest single gap on the platform.
//   - Then the fields coaches filter and search on.
//   - Phone/DOB/height last: admin detail, invisible to the people recruiting.

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
  /** Has any Game Performance Tracker data (logged matches or career rows) —
   *  the tracker is the source of truth now, so this satisfies the "Season
   *  stats" check on its own, independent of the legacy flat columns. */
  hasPerformanceLog?: boolean
  /** Has at least one self-reported career_stats row — a past club/season
   *  entered into the tracker's history editor. Distinct from
   *  hasPerformanceLog: that's about *current* activity being logged, this is
   *  about pedigree — the full record, which no other non-league platform
   *  shows. Drives the "Playing history" check below. */
  hasCareerHistory?: boolean
}

/** `why` is shown to the player as the reason to bother. Keep it concrete. */
export type CompletionCheck = {
  label: string
  why: string
  done: (p: CompletionProfile) => boolean
}

export const COMPLETION_CHECKS: CompletionCheck[] = [
  { label: 'Profile photo',  why: 'Profiles with a photo get looked at first.',            done: p => !!p.avatar_url },
  { label: 'Highlight reel', why: 'Coaches want to see you play before they message.',     done: p => Array.isArray(p.highlight_urls) && p.highlight_urls.length > 0 },
  { label: 'Position',       why: 'Coaches filter by position — you\'re invisible without it.', done: p => !!p.position },
  { label: 'Playing level',  why: 'Matches you to roles at the right step.',               done: p => !!p.playing_level },
  { label: 'Location',       why: 'Coaches search by area to find players nearby.',        done: p => !!p.city },
  { label: 'Availability',   why: 'Tells coaches whether you can actually be signed.',     done: p => !!p.status },
  { label: 'Club',           why: 'Shows where you\'re playing now.',                      done: p => !!p.club },
  { label: 'Season stats',   why: 'Numbers back up everything else on your profile.',      done: p => !!p.hasPerformanceLog || (p.goals ?? 0) > 0 || (p.assists ?? 0) > 0 || (p.appearances ?? 0) > 0 },
  { label: 'Playing history', why: 'Your career record — clubs and levels you\'ve played, shown nowhere else in non-league.', done: p => !!p.hasCareerHistory },
  { label: 'Strongest foot', why: 'A detail coaches ask about constantly.',                done: p => !!p.foot },
  { label: 'Height',         why: 'Relevant for some positions and set pieces.',           done: p => !!p.height },
  { label: 'Date of birth',  why: 'Confirms your age bracket for age-group sides.',        done: p => !!p.date_of_birth },
  { label: 'Phone number',   why: 'How a coach reaches you once they\'re interested.',     done: p => !!p.phone },
]

export function calcCompletion(profile: CompletionProfile): {
  pct: number
  missing: string[]
  /** First unfinished check in ranked order — what the bar should ask for. */
  next: CompletionCheck | null
} {
  const results = COMPLETION_CHECKS.map(c => ({ check: c, isDone: c.done(profile) }))
  const filled = results.filter(r => r.isDone).length
  const pct = Math.round((filled / results.length) * 100)
  const outstanding = results.filter(r => !r.isDone)
  return {
    pct,
    missing: outstanding.map(r => r.check.label),
    next: outstanding[0]?.check ?? null,
  }
}

// ─── Coach completion ─────────────────────────────────────────────────────────

export type CoachCompletionProfile = {
  avatar_url?: string | null
  full_name?: string | null
  club?: string | null
  city?: string | null
  phone?: string | null
  coaching_role?: string | null
  coaching_level?: string | null
  coaching_history?: string | null
}

// Same ranking principle as the player list. 76% of coaches have no photo, so
// that leads — a faceless coach is one players hesitate to reply to, and
// replies are the whole point of the account.
export type CoachCompletionCheck = {
  label: string
  why: string
  done: (p: CoachCompletionProfile) => boolean
}

export const COACH_COMPLETION_CHECKS: CoachCompletionCheck[] = [
  { label: 'Profile photo',       why: 'Players reply to a coach they can see.',              done: p => !!p.avatar_url },
  { label: 'Club / Organisation', why: 'Players want to know who they\'d be joining.',        done: p => !!p.club },
  { label: 'Coaching role',       why: 'Shows players who they\'re dealing with.',            done: p => !!p.coaching_role },
  { label: 'Coaching level',      why: 'Sets expectations about the standard you work at.',   done: p => !!p.coaching_level },
  { label: 'Coaching history',    why: 'Your track record is what earns a reply.',            done: p => !!p.coaching_history },
  { label: 'Location',            why: 'Players search by area to find clubs nearby.',        done: p => !!p.city },
  { label: 'Full name',           why: 'Anonymous accounts get ignored.',                     done: p => !!p.full_name },
  { label: 'Phone number',        why: 'How a player reaches you once you\'ve made contact.', done: p => !!p.phone },
]

export function calcCoachCompletion(profile: CoachCompletionProfile): {
  pct: number
  missing: string[]
  next: CoachCompletionCheck | null
} {
  const results = COACH_COMPLETION_CHECKS.map(c => ({ check: c, isDone: c.done(profile) }))
  const filled = results.filter(r => r.isDone).length
  const pct = Math.round((filled / results.length) * 100)
  const outstanding = results.filter(r => !r.isDone)
  return {
    pct,
    missing: outstanding.map(r => r.check.label),
    next: outstanding[0]?.check ?? null,
  }
}
