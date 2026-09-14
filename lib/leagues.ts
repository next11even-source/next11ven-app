// Curated list of English non-league competitions by pyramid step.
// Stored as free text on opportunities.league — coaches pick from this list
// when posting a role; the value is shown in the card meta line.
//
// Coverage: Steps 1–7 of the National League System. Welsh / off-ladder levels
// ("Wales 1", "U18s/Academy", "Other") have no equivalent here — coaches on
// those levels leave the field blank.
//
// To add a competition: append to the relevant step block, keeping the list
// alphabetical within each step. Do NOT rename existing entries without a
// migration to update existing opportunity rows.

export type League = {
  name: string
  step: number
}

export const LEAGUES: League[] = [
  // ── Step 1 ─────────────────────────────────────────────────────────────────
  { name: 'National League',                                          step: 1 },

  // ── Step 2 ─────────────────────────────────────────────────────────────────
  { name: 'National League North',                                    step: 2 },
  { name: 'National League South',                                    step: 2 },

  // ── Step 3 ─────────────────────────────────────────────────────────────────
  { name: 'Isthmian League Premier Division',                         step: 3 },
  { name: 'Northern Premier League Premier Division',                 step: 3 },
  { name: 'Southern League Premier Division Central',                 step: 3 },
  { name: 'Southern League Premier Division South',                   step: 3 },

  // ── Step 4 ─────────────────────────────────────────────────────────────────
  { name: 'Isthmian League Division One North',                       step: 4 },
  { name: 'Isthmian League Division One South Central',               step: 4 },
  { name: 'Isthmian League Division One South East',                  step: 4 },
  { name: 'Northern Premier League Division One East',                step: 4 },
  { name: 'Northern Premier League Division One Midlands',            step: 4 },
  { name: 'Northern Premier League Division One West',                step: 4 },
  { name: 'Southern League Division One Central',                     step: 4 },
  { name: 'Southern League Division One East',                        step: 4 },
  { name: 'Southern League Division One South',                       step: 4 },

  // ── Step 5 ─────────────────────────────────────────────────────────────────
  { name: 'Combined Counties League Premier Division',                step: 5 },
  { name: 'East Midlands Counties League Premier Division',           step: 5 },
  { name: 'Essex Senior League',                                      step: 5 },
  { name: 'Hellenic League Premier Division',                         step: 5 },
  { name: 'Kent Football United Premier Division',                    step: 5 },
  { name: 'Midland League Premier Division',                          step: 5 },
  { name: 'North West Counties League Premier Division',              step: 5 },
  { name: 'Northern Counties East League Premier Division',           step: 5 },
  { name: 'Southern Counties East League Premier Division',           step: 5 },
  { name: 'Spartan South Midlands League Premier Division',           step: 5 },
  { name: 'United Counties League Premier Division North',            step: 5 },
  { name: 'United Counties League Premier Division South',            step: 5 },
  { name: 'Western League Premier Division',                          step: 5 },

  // ── Step 6 ─────────────────────────────────────────────────────────────────
  { name: 'Combined Counties League Division One',                    step: 6 },
  { name: 'East Midlands Counties League Division One',               step: 6 },
  { name: 'Hampshire Premier League',                                 step: 6 },
  { name: 'Hellenic League Division One East',                        step: 6 },
  { name: 'Hellenic League Division One West',                        step: 6 },
  { name: 'Midland League Division One',                              step: 6 },
  { name: 'North West Counties League Division One North',            step: 6 },
  { name: 'North West Counties League Division One South',            step: 6 },
  { name: 'Northern Counties East League Division One',               step: 6 },
  { name: 'Southern Counties East League Division One',               step: 6 },
  { name: 'Spartan South Midlands League Division One',               step: 6 },
  { name: 'United Counties League Division One North',                step: 6 },
  { name: 'United Counties League Division One South',                step: 6 },
  { name: 'Western League Division One',                              step: 6 },

  // ── Step 7 ─────────────────────────────────────────────────────────────────
  { name: 'Anglian Combination Premier Division',                     step: 7 },
  { name: 'Cheshire Association Football League Premier Division',    step: 7 },
  { name: 'Cumberland County Football League',                        step: 7 },
  { name: 'Dorset Premier League',                                    step: 7 },
  { name: 'Durham Alliance Premier Division',                         step: 7 },
  { name: 'Essex & Suffolk Border League Premier Division',           step: 7 },
  { name: 'Gloucestershire County Football League',                   step: 7 },
  { name: 'Hampshire Premier League Division One',                    step: 7 },
  { name: 'Herefordshire Football League Premier Division',           step: 7 },
  { name: 'Kent County Football League Premier Division',             step: 7 },
  { name: 'Lancashire Amateur League Premier Division',               step: 7 },
  { name: 'Leicestershire & Rutland County Football League',          step: 7 },
  { name: 'Lincolnshire Football League',                             step: 7 },
  { name: 'Liverpool County Football Combination Premier Division',   step: 7 },
  { name: 'Manchester Football League',                               step: 7 },
  { name: 'Middlesex County Football League Premier Division',        step: 7 },
  { name: 'North Riding Football League Premier Division',            step: 7 },
  { name: 'Northamptonshire Combination Premier Division',            step: 7 },
  { name: 'Nottinghamshire Senior League Division One',               step: 7 },
  { name: 'Oxfordshire Senior Football League Premier Division',      step: 7 },
  { name: 'Sheffield & Hallamshire County Senior League Premier Division', step: 7 },
  { name: 'Somerset County League Premier Division',                  step: 7 },
  { name: 'Suffolk & Ipswich League Senior Division',                 step: 7 },
  { name: 'Surrey County Premier League',                             step: 7 },
  { name: 'West Riding County Amateur League Premier Division',       step: 7 },
  { name: 'Wiltshire County Football League',                         step: 7 },
]

/**
 * Returns leagues for a given step, or the full list when step is null
 * (e.g. when the coach hasn't selected a level yet).
 */
export function leaguesForStep(step: number | null): League[] {
  if (step === null) return LEAGUES
  return LEAGUES.filter(l => l.step === step)
}

// Unique step numbers present in LEAGUES, sorted ascending.
export const LEAGUE_STEPS = Array.from(new Set(LEAGUES.map(l => l.step))).sort((a, b) => a - b)
