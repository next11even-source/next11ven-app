// Colour + label config for each playing level.
// Used by opportunity icons on coach and player homepages.

export type LevelConfig = {
  line1: string  // top line of badge (e.g. "STEP", "NAT", "PL")
  line2: string  // bottom line (e.g. "3", "LEAGUE", "")
  color: string  // text + border colour
  bg: string     // background tint
}

const LEVEL_MAP: Record<string, LevelConfig> = {
  'Premier League':              { line1: 'PREM',  line2: 'LEAGUE', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  'Championship':                { line1: 'CHAM',  line2: 'PIONSHIP',color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  'League One':                  { line1: 'LEAGUE', line2: 'ONE',   color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  'League Two':                  { line1: 'LEAGUE', line2: 'TWO',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  'National League':             { line1: 'NAT',   line2: 'LEAGUE', color: '#e2c07a', bg: 'rgba(226,192,122,0.12)' },
  'National League North/South': { line1: 'NL',    line2: 'N/S',    color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  'Step 3':                      { line1: 'STEP',  line2: '3',      color: '#2d5fc4', bg: 'rgba(45,95,196,0.15)' },
  'Step 4':                      { line1: 'STEP',  line2: '4',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  'Step 5':                      { line1: 'STEP',  line2: '5',      color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
  'Step 6':                      { line1: 'STEP',  line2: '6',      color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  'Step 7 and below':            { line1: 'STEP',  line2: '7+',     color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
}

const FALLBACK: LevelConfig = {
  line1: 'OPEN', line2: '', color: '#8892aa', bg: 'rgba(136,146,170,0.1)',
}

export function getLevelConfig(level: string | null | undefined): LevelConfig {
  if (!level) return FALLBACK
  return LEVEL_MAP[level] ?? FALLBACK
}
