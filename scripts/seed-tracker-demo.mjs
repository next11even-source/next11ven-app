/**
 * seed-tracker-demo.mjs
 *
 * Seeds a complete, believable Game Performance Tracker record for the demo
 * account (default: Reece Smith / test123@next11ven.com) so the tracker can be
 * screenshotted for the marketing site with real numbers instead of an empty
 * state.
 *
 * What it builds:
 *   - 2 club stints: Abbey Hey FC (Step 6, 2025/26, ended) → Trafford FC
 *     (Step 5, ongoing). The step-up drives the tracker's "at Step 5" context.
 *   - 39 competitive matches across 2025/26 (35 league + 4 cup) with a real
 *     season arc: slow start, a December injury, then a spring purple patch.
 *   - 6 pre-season friendlies in July 2026 (the current season, 2026/27).
 *   - 2 pre-platform career_stats seasons (2023/24, 2024/25).
 *   - Season targets for both seasons — 2025/26 comfortably hit.
 *   - Profile fields aligned with the record (club, level, contract status).
 *
 * The match data is tuned so specific tracker surfaces fire:
 *   - 2025/26 insight banner  → goal-involvement streak (11 in the last 6)
 *   - 2025/26 MOTM banner     → 6 awards
 *   - 2025/26 hero form chip  → positive (last 5 involvements > previous 5)
 *   - 2026/27 insight banner  → Man of the match vs Curzon Ashton
 *
 * SAFE BY DEFAULT: dry-run (prints the computed totals, writes nothing) unless
 * you pass --write.
 *
 * Idempotent in --write mode: deletes this player's existing stints, matches,
 * career_stats and targets first, then re-inserts. Only ever touches the one
 * demo player id it resolves from --email.
 *
 * Run from the project root (.env.local has multi-line values, so load it with
 * dotenv rather than `source`):
 *   node -r dotenv/config scripts/seed-tracker-demo.mjs dotenv_config_path=.env.local
 *   node -r dotenv/config scripts/seed-tracker-demo.mjs dotenv_config_path=.env.local --write
 */

import { createClient } from '@supabase/supabase-js'

const WRITE = process.argv.includes('--write')

const emailArg = process.argv.find(a => a.startsWith('--email='))
const EMAIL = emailArg ? emailArg.split('=')[1] : 'test123@next11ven.com'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error('Missing env vars. Run: source .env.local first.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false },
})

// ── Stints ────────────────────────────────────────────────────────────────────
const STINTS = {
  abbey: {
    club_name: 'Abbey Hey FC',
    level: 'Step 6',
    stint_type: 'contracted',
    start_date: '2025-06-15',
    end_date: '2026-05-31',
  },
  trafford: {
    club_name: 'Trafford FC',
    level: 'Step 5',
    stint_type: 'contracted',
    start_date: '2026-06-08',
    end_date: null,
  },
}

// ── 2025/26 at Abbey Hey (Step 6, NWCFL Premier) ──────────────────────────────
// [date, opponent, comp, competition_name, gf, ga, started, minutes, G, A, rating, tags, yellows]
const SEASON_2025 = [
  ['2025-08-09', 'Prestwich Heys',           'league', null,                    1, 1, true,  90, 0, 0, 6.5, [], 0],
  ['2025-08-16', 'Bootle',                   'league', null,                    0, 2, true,  90, 0, 0, 6.0, [], 1],
  ['2025-08-23', 'Cheadle Town',             'league', null,                    3, 1, true,  90, 0, 1, 7.0, [], 0],
  ['2025-08-30', 'Irlam',                    'league', null,                    2, 2, true,  85, 1, 0, 7.0, [], 0],
  ['2025-09-06', 'Ashton Town',              'league', null,                    1, 0, true,  90, 0, 0, 7.0, [], 0],
  ['2025-09-09', 'Congleton Town',           'cup',    'FA Vase',               4, 1, true,  90, 1, 1, 7.5, [], 0],
  ['2025-09-13', 'Daisy Hill',               'league', null,                    2, 3, false, 32, 0, 0, 6.5, [], 0],
  ['2025-09-20', 'Padiham',                  'league', null,                    1, 1, true,  90, 0, 1, 7.0, [], 0],
  ['2025-09-27', 'Squires Gate',             'league', null,                    0, 1, true,  90, 0, 0, 6.5, [], 1],
  ['2025-10-04', 'Charnock Richard',         'league', null,                    3, 0, true,  90, 1, 0, 7.5, [], 0],
  ['2025-10-07', 'Winsford United',          'cup',    'NWCFL Challenge Cup',   2, 1, true,  90, 0, 1, 7.0, [], 0],
  ['2025-10-11', 'Burscough',                'league', null,                    1, 2, true,  90, 0, 0, 6.5, [], 0],
  ['2025-10-18', 'Lower Breck',              'league', null,                    2, 1, true,  90, 1, 0, 7.5, [], 0],
  ['2025-10-25', 'Silsden',                  'league', null,                    0, 0, true,  90, 0, 0, 7.0, [], 0],
  ['2025-11-01', 'Wythenshawe Town',         'league', null,                    4, 1, true,  90, 1, 1, 8.0, ['man_of_the_match'], 0],
  ['2025-11-08', 'Golcar United',            'league', null,                    1, 3, true,  90, 0, 0, 6.0, [], 1],
  ['2025-11-11', 'Stone Old Alleynians',     'cup',    'Manchester Premier Cup',3, 2, true,  90, 1, 0, 7.5, [], 0],
  ['2025-11-15', 'Longridge Town',           'league', null,                    2, 0, true,  90, 0, 1, 7.5, [], 0],
  ['2025-11-22', 'Barnoldswick Town',        'league', null,                    1, 1, true,  78, 0, 0, 6.5, [], 0],
  ['2025-11-29', 'West Didsbury & Chorlton', 'league', null,                    3, 1, true,  90, 1, 1, 8.0, ['man_of_the_match'], 0],
  ['2025-12-06', 'Avro',                     'league', null,                    0, 2, true,  90, 0, 0, 6.5, [], 0],
  ['2025-12-13', 'St Helens Town',           'league', null,                    2, 1, true,  90, 0, 1, 7.5, [], 0],
  // Pulled up injured at Litherland — misses the Boxing Day and New Year games.
  ['2025-12-20', 'Litherland REMYCA',        'league', null,                    1, 0, true,  62, 0, 0, 7.0, [], 0],
  ['2026-01-10', 'Prestwich Heys',           'league', null,                    2, 2, false, 45, 0, 0, 6.5, ['return_from_injury'], 0],
  ['2026-01-17', 'Bootle',                   'league', null,                    1, 0, true,  75, 0, 1, 7.0, [], 0],
  ['2026-01-24', 'Cheadle Town',             'league', null,                    3, 2, true,  90, 1, 1, 8.0, ['captain'], 0],
  ['2026-01-31', 'Irlam',                    'league', null,                    1, 1, true,  90, 0, 0, 7.0, ['captain'], 0],
  ['2026-02-07', 'Ashton Town',              'league', null,                    2, 0, true,  90, 1, 0, 7.5, ['captain'], 0],
  ['2026-02-10', 'Runcorn Town',             'cup',    'Manchester Premier Cup',2, 3, true,  90, 1, 0, 7.5, ['captain'], 0],
  ['2026-02-14', 'Daisy Hill',               'league', null,                    4, 0, true,  90, 1, 1, 8.5, ['man_of_the_match', 'captain'], 0],
  ['2026-02-21', 'Padiham',                  'league', null,                    0, 1, true,  90, 0, 0, 6.5, ['captain'], 1],
  ['2026-02-28', 'Squires Gate',             'league', null,                    3, 1, true,  90, 1, 1, 8.0, ['man_of_the_match', 'captain'], 0],
  ['2026-03-07', 'Charnock Richard',         'league', null,                    2, 2, true,  90, 0, 1, 7.5, ['captain'], 0],
  // ── The run that powers the insight banner: 6 games, 11 involvements ───────
  ['2026-03-14', 'Burscough',                'league', null,                    3, 2, true,  90, 2, 0, 8.5, ['man_of_the_match', 'captain'], 0],
  ['2026-03-21', 'Lower Breck',              'league', null,                    2, 1, true,  90, 1, 1, 8.0, ['captain'], 0],
  ['2026-03-28', 'Silsden',                  'league', null,                    4, 2, true,  90, 1, 2, 8.5, ['man_of_the_match', 'captain'], 0],
  ['2026-04-04', 'Wythenshawe Town',         'league', null,                    2, 0, true,  90, 0, 1, 7.5, ['captain'], 0],
  ['2026-04-11', 'Golcar United',            'league', null,                    3, 1, true,  90, 1, 1, 8.0, ['captain'], 0],
  ['2026-04-18', 'Longridge Town',           'league', null,                    2, 1, true,  90, 1, 0, 8.0, ['captain'], 0],
]

// ── 2026/27 pre-season at Trafford (Step 5, NPL Division One West) ────────────
const SEASON_2026 = [
  ['2026-07-01', 'Chadderton',        'pre_season', null, 3, 1, true, 60, 1, 0, 7.0, [], 0],
  ['2026-07-04', 'Ashton Athletic',   'pre_season', null, 2, 2, true, 65, 0, 1, 7.0, [], 0],
  ['2026-07-07', 'Glossop North End', 'pre_season', null, 1, 2, true, 70, 0, 0, 6.5, [], 0],
  ['2026-07-11', 'Runcorn Linnets',   'pre_season', null, 4, 1, true, 75, 1, 1, 8.0, [], 0],
  ['2026-07-14', 'Stalybridge Celtic','pre_season', null, 2, 1, true, 80, 0, 1, 7.5, ['captain'], 0],
  ['2026-07-18', 'Curzon Ashton',     'pre_season', null, 3, 0, true, 90, 1, 1, 8.5, ['man_of_the_match', 'captain'], 0],
]

// ── Pre-platform history (career_stats) ───────────────────────────────────────
const CAREER = [
  {
    season_start_year: 2023, club_name: 'Stockport Georgians', level: 'Step 7',
    position: 'CM', apps: 26, goals: 6, assists: 8, minutes: 2130, clean_sheets: null,
    source: 'self_reported',
  },
  {
    season_start_year: 2024, club_name: 'Abbey Hey FC', level: 'Step 6',
    position: 'CM', apps: 31, goals: 11, assists: 9, minutes: 2604, clean_sheets: null,
    source: 'self_reported',
  },
]

// ── Season targets ────────────────────────────────────────────────────────────
const TARGETS = [
  { season_start_year: 2025, apps_target: 30, goals_target: 12, assists_target: 12 },
  { season_start_year: 2026, apps_target: 40, goals_target: 18, assists_target: 18 },
]

// ── Profile fields to align with the record ───────────────────────────────────
const PROFILE_PATCH = {
  club: 'Trafford FC',
  playing_level: 'Step 5',
  position: 'CM',
  secondary_position: 'ST',
  status: 'signed',
  contract_status: 'non_contract',
  height: "5'10",
  foot: 'Right',
  city: 'Manchester',
  bio: 'Box-to-box midfielder, comfortable stepping into the ten. Captained Abbey Hey through 2025/26 and stepped up to Step 5 with Trafford this summer. I log every game — the record speaks for itself.',
  premium: true,
  actively_looking: true,
  performance_stats_public: true,
  performance_include_preseason: true,
}

function rowsFor(playerId, stintId, defs) {
  return defs.map(([date, opponent, comp, compName, gf, ga, started, mins, goals, assists, rating, tags, yellows]) => ({
    player_id: playerId,
    stint_id: stintId,
    match_date: date,
    opponent,
    competition_type: comp,
    competition_name: compName,
    goals_for: gf,
    goals_against: ga,
    started,
    position: 'CM',
    minutes_played: mins,
    goals,
    assists,
    penalty_saves: 0,
    yellow_cards: yellows,
    red_card: false,
    rating,
    notes: null,
    tags,
  }))
}

function report(label, rows) {
  const competitive = rows.filter(r => r.competition_type === 'league' || r.competition_type === 'cup')
  const set = competitive.length ? competitive : rows
  const goals = set.reduce((n, r) => n + r.goals, 0)
  const assists = set.reduce((n, r) => n + r.assists, 0)
  const minutes = set.reduce((n, r) => n + (r.minutes_played ?? 0), 0)
  const rated = set.filter(r => r.rating != null)
  const avg = rated.length ? (rated.reduce((n, r) => n + r.rating, 0) / rated.length) : null
  const motm = set.filter(r => r.tags.includes('man_of_the_match')).length
  const starts = set.filter(r => r.started).length
  const wins = set.filter(r => r.goals_for > r.goals_against).length
  console.log(`\n  ${label}`)
  console.log(`    apps ${set.length} · starts ${starts} · goals ${goals} · assists ${assists} · G+A ${goals + assists}`)
  console.log(`    minutes ${minutes} (avg ${Math.round(minutes / set.length)}') · avg rating ${avg ? avg.toFixed(1) : '—'} · MOTM ${motm} · won ${wins}`)
}

async function main() {
  console.log(`\n${WRITE ? 'WRITE' : 'DRY-RUN'} — seeding tracker demo data for ${EMAIL}\n`)

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('email', EMAIL)
    .single()

  if (profErr || !profile) {
    console.error(`Could not find a profile for ${EMAIL}:`, profErr?.message)
    process.exit(1)
  }
  if (profile.role !== 'player' && profile.role !== 'admin') {
    console.error(`${EMAIL} is a ${profile.role}, not a player. Refusing to seed.`)
    process.exit(1)
  }

  const playerId = profile.id
  console.log(`  Player: ${profile.full_name} (${playerId})`)

  // Dry-run: build the rows with placeholder stint ids just to report totals.
  const preview2025 = rowsFor(playerId, null, SEASON_2025)
  const preview2026 = rowsFor(playerId, null, SEASON_2026)
  report('2025/26 (Abbey Hey, Step 6) — competitive', preview2025)
  report('2026/27 (Trafford, Step 5) — pre-season', preview2026)
  console.log(`\n  Career history rows: ${CAREER.length} · targets: ${TARGETS.length}`)

  if (!WRITE) {
    console.log('\n  Dry-run only. Re-run with --write to apply.\n')
    return
  }

  // Idempotent reset — matches first (stint_id FK), then the rest.
  for (const table of ['performance_matches', 'club_stints', 'career_stats', 'performance_targets']) {
    const { error } = await supabase.from(table).delete().eq('player_id', playerId)
    if (error) throw new Error(`Failed clearing ${table}: ${error.message}`)
  }
  console.log('\n  Cleared existing tracker rows.')

  const { data: stints, error: stintErr } = await supabase
    .from('club_stints')
    .insert([
      { player_id: playerId, ...STINTS.abbey },
      { player_id: playerId, ...STINTS.trafford },
    ])
    .select('id, club_name')
  if (stintErr) throw new Error(`Failed inserting stints: ${stintErr.message}`)

  const abbeyId = stints.find(s => s.club_name === STINTS.abbey.club_name).id
  const traffordId = stints.find(s => s.club_name === STINTS.trafford.club_name).id
  console.log(`  Inserted ${stints.length} club stints.`)

  const matchRows = [
    ...rowsFor(playerId, abbeyId, SEASON_2025),
    ...rowsFor(playerId, traffordId, SEASON_2026),
  ]
  const { error: matchErr } = await supabase.from('performance_matches').insert(matchRows)
  if (matchErr) throw new Error(`Failed inserting matches: ${matchErr.message}`)
  console.log(`  Inserted ${matchRows.length} matches.`)

  const { error: careerErr } = await supabase
    .from('career_stats')
    .insert(CAREER.map(c => ({ player_id: playerId, ...c })))
  if (careerErr) throw new Error(`Failed inserting career_stats: ${careerErr.message}`)
  console.log(`  Inserted ${CAREER.length} career history seasons.`)

  const { error: targetErr } = await supabase
    .from('performance_targets')
    .insert(TARGETS.map(t => ({ player_id: playerId, ...t })))
  if (targetErr) throw new Error(`Failed inserting targets: ${targetErr.message}`)
  console.log(`  Inserted ${TARGETS.length} season targets.`)

  const { error: patchErr } = await supabase
    .from('profiles')
    .update({ ...PROFILE_PATCH, updated_at: new Date().toISOString() })
    .eq('id', playerId)
  if (patchErr) throw new Error(`Failed patching profile: ${patchErr.message}`)
  console.log('  Profile aligned with the record.')

  console.log('\n  Done.\n')
}

main().catch(err => {
  console.error('\n', err.message, '\n')
  process.exit(1)
})
