// Per-stat accent colours for the tracker stat tiles — shared by the
// dashboard grid, season wrap card and match detail so a stat is always the
// same colour everywhere. Labels are the lookup key; anything unmapped falls
// back to the neutral surface tile.

export type StatAccent = {
  fg: string
  border: string
  background: string
}

const accent = (r: number, g: number, b: number, fg: string): StatAccent => ({
  fg,
  border: `1px solid rgba(${r},${g},${b},0.35)`,
  background: `linear-gradient(160deg, rgba(${r},${g},${b},0.13) 0%, rgba(${r},${g},${b},0.03) 100%)`,
})

const BLUE = accent(58, 111, 218, '#3a6fda')
const ORANGE = accent(249, 115, 22, '#f97316')
const SKY = accent(56, 189, 248, '#38bdf8')
const AMBER = accent(245, 158, 11, '#f59e0b')

export const NEUTRAL_STAT: StatAccent = {
  fg: '#e8dece',
  border: '1px solid #1e2235',
  background: '#13172a',
}

const STAT_ACCENTS: Record<string, StatAccent> = {
  Apps: BLUE,
  Goals: ORANGE,
  Assists: SKY,
  'G + A': ORANGE,
  'Clean sheets': SKY,
  'Pen saves': ORANGE,
  'Avg rating': AMBER,
  Rating: AMBER,
  Minutes: BLUE,
  MOTM: AMBER,
}

export function statAccent(label: string): StatAccent {
  return STAT_ACCENTS[label] ?? NEUTRAL_STAT
}
