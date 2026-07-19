// Colour + label config for each playing level.
// Used by opportunity icons on coach and player homepages.
//
// Step colours are NOT defined here — they come from lib/stepTokens.ts, the
// single source of truth for step colour. Any "Step N" (and its National League
// equivalent) resolves its colour via stepEntry() below; only the off-ladder
// levels (leagues, U18s, Wales, Other) carry their own palette.

import { STEP_TOKENS, type StepKey } from '@/lib/stepTokens'

export type LevelConfig = {
  line1: string  // top line of badge (e.g. "STEP", "NAT", "PL")
  line2: string  // bottom line (e.g. "3", "LEAGUE", "")
  color: string  // text + border colour
  bg: string     // background tint
}

// Build a Step N badge config from the shared token, so step colour lives in
// exactly one place. line2 defaults to the step number.
function stepEntry(n: StepKey, line2?: string): LevelConfig {
  const { color } = STEP_TOKENS[n]
  return { line1: 'STEP', line2: line2 ?? String(n), color, bg: `${color}22` }
}

const LEVEL_MAP: Record<string, LevelConfig> = {
  'Premier League':              { line1: 'PREM',  line2: 'LEAGUE', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  'Championship':                { line1: 'CHAM',  line2: 'PIONSHIP',color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  'League One':                  { line1: 'LEAGUE', line2: 'ONE',   color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  'League Two':                  { line1: 'LEAGUE', line2: 'TWO',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  'National League':             stepEntry(1),
  'National League North/South': stepEntry(2),
  'Step 1':                      stepEntry(1),
  'Step 2':                      stepEntry(2),
  'Step 3':                      stepEntry(3),
  'Step 4':                      stepEntry(4),
  'Step 5':                      stepEntry(5),
  'Step 6':                      stepEntry(6),
  'Step 7':                      stepEntry(7),
  'Step 7 and below':            stepEntry(7, '7+'),
  'U18s/Academy':                { line1: 'U18s',  line2: 'ACAD',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  'Wales 1':                     { line1: 'WALES', line2: '1',      color: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
  'Wales 2':                     { line1: 'WALES', line2: '2',      color: '#fb7185', bg: 'rgba(251,113,133,0.12)' },
  'Other':                       { line1: 'OTHER', line2: '',        color: '#8892aa', bg: 'rgba(136,146,170,0.1)' },
}

const FALLBACK: LevelConfig = {
  line1: 'OPEN', line2: '', color: '#8892aa', bg: 'rgba(136,146,170,0.1)',
}

export function getLevelConfig(level: string | null | undefined): LevelConfig {
  if (!level) return FALLBACK
  return LEVEL_MAP[level] ?? FALLBACK
}
