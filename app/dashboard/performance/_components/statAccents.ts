// Tracker stat styling — deliberately uniform. One accent for the whole
// tracker (brand blue), used to lift only the single most important stat per
// view; everything else is neutral so the page reads as one system instead of
// a rainbow. Shared by the dashboard grid, season wrap and match detail.

export type StatAccent = {
  fg: string
  border: string
  background: string
}

export const NEUTRAL_STAT: StatAccent = {
  fg: '#e8dece',
  border: '1px solid #1e2235',
  background: '#13172a',
}

// The one accent — reserved for the primary metric of a view.
export const PRIMARY_STAT: StatAccent = {
  fg: '#3a6fda',
  border: '1px solid rgba(45,95,196,0.45)',
  background: 'linear-gradient(160deg, rgba(45,95,196,0.16) 0%, rgba(45,95,196,0.04) 100%)',
}

// Every stat tile is neutral by default. Callers that want to lift the headline
// stat opt in with PRIMARY_STAT explicitly.
export function statAccent(): StatAccent {
  return NEUTRAL_STAT
}
