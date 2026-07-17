/**
 * backfill-career-stats.mjs
 *
 * Migrates legacy manual season stats (profiles.goals / assists / appearances +
 * the free-text `season` string + club/playing_level/position) into the
 * career_stats table as source='legacy_import', so the tracker-derived public
 * profile can render a player's pre-platform history instead of a blank slate.
 *
 * SAFE BY DEFAULT: runs as a DRY-RUN (report only, writes nothing) unless you
 * pass --write. Eyeball the parse report — especially the "needs a decision"
 * bucket (unplaceable season strings) — BEFORE ever using --write. Legacy
 * columns keep displaying until this runs clean; nothing is retired here.
 *
 * Idempotent in --write mode: it first deletes existing source='legacy_import'
 * rows (never touching player-entered 'self_reported' rows), then re-inserts.
 *
 * Run from the project root (needs the same env as the app):
 *   source .env.local && node scripts/backfill-career-stats.mjs            # dry-run
 *   source .env.local && node scripts/backfill-career-stats.mjs --write    # writes
 */

import { createClient } from '@supabase/supabase-js'

const WRITE = process.argv.includes('--write')

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error('Missing env vars. Run: source .env.local first.')
  console.error('  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

const CURRENT_YEAR = new Date().getUTCFullYear()

// Current season START year — mirrors lib/performance.seasonStartYear
// (July onwards = that year, else previous).
function currentSeasonStartYear() {
  const d = new Date()
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
}

// ── Season parsing ─────────────────────────────────────────────────────────────
// Free-text `season` → the season START year (e.g. "2025/26" → 2025). Returns
// { year, confidence } or null when it can't be placed. confidence:
//   'exact'   — the whole string IS an explicit range: 2025/26, 24/25, 2024-2025
//   'assumed' — a lower-confidence deterministic read: a bare year (2025), an
//               embedded token inside a longer label ("Ardal South East 25/26"),
//               or the phrase "This Season". Flagged so it can be re-checked by
//               provenance later without re-scanning the whole set.
//
// NEVER fabricates a year. If nothing deterministic matches, returns null and
// the row stays out of career_stats (rides on legacy display until the player
// places it themselves — the correct repair path).
function parseSeasonStartYear(raw) {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null

  const inBounds = (y) => y >= 1980 && y <= CURRENT_YEAR + 1

  // ── Exact: the whole string is a range ──
  // 4-digit start with 2- or 4-digit end: 2025/26, 2024/2025, 2025-26
  let m = /^(\d{4})\s*[\/\-–]\s*(\d{2,4})$/.exec(s)
  if (m) {
    const y = parseInt(m[1], 10)
    return inBounds(y) ? { year: y, confidence: 'exact' } : null
  }
  // 2-digit / 2-digit: 24/25 → 2024
  m = /^(\d{2})\s*[\/\-–]\s*(\d{2})$/.exec(s)
  if (m) {
    const y = 2000 + parseInt(m[1], 10)
    return inBounds(y) ? { year: y, confidence: 'exact' } : null
  }

  // ── Assumed: deterministic but lower-confidence ──
  // Bare 4-digit year: 2025 → assume the 2025/26 season (START year)
  m = /^(\d{4})$/.exec(s)
  if (m) {
    const y = parseInt(m[1], 10)
    return inBounds(y) ? { year: y, confidence: 'assumed' } : null
  }
  // The exact phrase "This Season" → current season start
  if (/^this\s+season$/i.test(s)) {
    return { year: currentSeasonStartYear(), confidence: 'assumed' }
  }
  // Embedded 4-digit range anywhere in a longer label: "…25/26 Davyhulme…"
  m = /(?<!\d)(\d{4})\s*[\/\-–]\s*\d{2,4}(?!\d)/.exec(s)
  if (m) {
    const y = parseInt(m[1], 10)
    if (inBounds(y)) return { year: y, confidence: 'assumed' }
  }
  // Embedded 2/2 token: "Ardal South East 25/26", "25-26 Long Buckby"
  m = /(?<!\d)(\d{2})\s*[\/\-–]\s*\d{2}(?!\d)/.exec(s)
  if (m) {
    const y = 2000 + parseInt(m[1], 10)
    if (inBounds(y)) return { year: y, confidence: 'assumed' }
  }

  return null
}

// Season start year for a match date — mirrors lib/performance.seasonStartYear
// (July onwards = that year, else previous).
function seasonOfMatch(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1
}

function seasonLabel(y) {
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`
}

const hasStats = (p) => (p.appearances ?? 0) > 0 || (p.goals ?? 0) > 0 || (p.assists ?? 0) > 0

// Per-season sanity cap. Each legacy row is a single-season line, and nobody
// plays 150 non-league games (or scores 150) in one season — so 150 sits
// comfortably above any real value while catching six-figure junk (e.g. a
// 242,532-app row). Runs INDEPENDENT of whether the season parsed: the point is
// the garbage row you haven't seen with a clean season string that would import
// silently.
const CAP = 150
const exceedsCap = (p) =>
  (p.appearances ?? 0) > CAP || (p.goals ?? 0) > CAP || (p.assists ?? 0) > CAP

// ── Load ────────────────────────────────────────────────────────────────────────
console.log(`\n${WRITE ? '✍️  WRITE MODE' : '🔍 DRY-RUN (no writes)'} — backfill-career-stats\n`)

const { data: players, error: pErr } = await supabase
  .from('profiles')
  .select('id, email, full_name, role, season, club, playing_level, position, goals, assists, appearances')
  .in('role', ['player', 'admin'])

if (pErr) { console.error('Failed to load profiles:', pErr.message); process.exit(1) }

// All logged matches → per-player set of season years already covered by the log
// (those seasons are log-sourced; a career row would be dropped at read anyway).
const { data: matches, error: mErr } = await supabase
  .from('performance_matches')
  .select('player_id, match_date')

if (mErr) { console.error('Failed to load matches:', mErr.message); process.exit(1) }

const loggedSeasons = new Map() // player_id -> Set(year)
for (const m of matches ?? []) {
  const set = loggedSeasons.get(m.player_id) ?? new Set()
  set.add(seasonOfMatch(m.match_date))
  loggedSeasons.set(m.player_id, set)
}

// ── Bucket ──────────────────────────────────────────────────────────────────────
const willWrite = []        // has stats + parseable season, not superseded by the log
const assumed = []          // subset of willWrite parsed at lower confidence (bare year / embedded / phrase)
const overlapsLog = []      // has stats + parseable, but the log already owns that season
const noStats = []          // nothing to migrate
const unplaceable = []      // has stats but the season string can't be parsed → NEEDS A DECISION
const outliers = []         // stat value exceeds the sanity cap → NEEDS A DECISION (never imported)

for (const p of players ?? []) {
  if (!hasStats(p)) { noStats.push(p); continue }

  // Sanity cap first — independent of the season, so junk never rides in on a
  // clean season string.
  if (exceedsCap(p)) { outliers.push(p); continue }

  const parsed = parseSeasonStartYear(p.season)
  if (!parsed) { unplaceable.push(p); continue }

  const logged = loggedSeasons.get(p.id)
  if (logged && logged.has(parsed.year)) {
    overlapsLog.push({ p, parsed })
    continue
  }

  const row = {
    player_id: p.id,
    season_start_year: parsed.year,
    club_name: p.club ?? null,
    level: p.playing_level ?? null,
    position: p.position ?? null,
    apps: p.appearances ?? null,
    goals: p.goals ?? null,
    assists: p.assists ?? null,
    minutes: null,        // unknown for legacy data
    clean_sheets: null,   // unknown for legacy data
    source: 'legacy_import',
  }
  willWrite.push({ p, parsed, row })
  if (parsed.confidence === 'assumed') assumed.push({ p, parsed })
}

// ── Report ──────────────────────────────────────────────────────────────────────
const sample = (arr, n = 12) => arr.slice(0, n)

console.log('── Summary ─────────────────────────────────────────────')
console.log(`  Player/admin profiles scanned:      ${(players ?? []).length}`)
console.log(`  ✅ Would write career_stats rows:    ${willWrite.length}   (of which ${assumed.length} "assumed", ${willWrite.length - assumed.length} exact)`)
console.log(`  ⏭  Skipped — log already owns season: ${overlapsLog.length}`)
console.log(`  ⏭  Skipped — no legacy stats:         ${noStats.length}`)
console.log(`  ⚠️  NEEDS A DECISION — unplaceable:   ${unplaceable.length}   (has stats, season string won't parse)`)
console.log(`  ⚠️  NEEDS A DECISION — over cap:      ${outliers.length}   (stat value > ${CAP}, likely junk)`)
console.log('────────────────────────────────────────────────────────\n')

console.log('── Sample of rows that WOULD be written ────────────────')
for (const { p, parsed, row } of sample(willWrite)) {
  console.log(`  ${(p.email ?? p.id).padEnd(34)} "${String(p.season ?? '').padEnd(9)}" → ${seasonLabel(parsed.year)}${parsed.confidence === 'assumed' ? ' (assumed)' : ''}  ·  ${row.apps ?? 0}a ${row.goals ?? 0}g ${row.assists ?? 0}as  ·  ${row.club_name ?? '—'} ${row.level ?? ''}`)
}
if (willWrite.length > 12) console.log(`  … and ${willWrite.length - 12} more`)
console.log('')

if (assumed.length) {
  console.log('── "Assumed" parses (bare year → taken as START year) ──')
  for (const { p, parsed } of sample(assumed)) {
    console.log(`  ${(p.email ?? p.id).padEnd(34)} "${p.season}" → ${seasonLabel(parsed.year)}`)
  }
  if (assumed.length > 12) console.log(`  … and ${assumed.length - 12} more`)
  console.log('')
}

if (overlapsLog.length) {
  console.log('── Skipped: the live log already owns this season ──────')
  for (const { p, parsed } of sample(overlapsLog)) {
    console.log(`  ${(p.email ?? p.id).padEnd(34)} "${p.season}" → ${seasonLabel(parsed.year)} (log wins)`)
  }
  if (overlapsLog.length > 12) console.log(`  … and ${overlapsLog.length - 12} more`)
  console.log('')
}

if (unplaceable.length) {
  console.log('── ⚠️  NEEDS A DECISION: stats present, season unparseable ──')
  console.log('   (these are NOT written. Their legacy columns keep displaying.)')
  for (const p of sample(unplaceable, 30)) {
    console.log(`  ${(p.email ?? p.id).padEnd(34)} season=${JSON.stringify(p.season)}  ·  ${p.appearances ?? 0}a ${p.goals ?? 0}g ${p.assists ?? 0}as  ·  ${p.club ?? '—'}`)
  }
  if (unplaceable.length > 30) console.log(`  … and ${unplaceable.length - 30} more`)
  console.log('')
}

if (outliers.length) {
  console.log(`── ⚠️  NEEDS A DECISION: stat value over the sanity cap (${CAP}) ──`)
  console.log('   (these are NOT written — the value is almost certainly junk.)')
  for (const p of sample(outliers, 30)) {
    console.log(`  ${(p.email ?? p.id).padEnd(34)} season=${JSON.stringify(p.season)}  ·  ${p.appearances ?? 0}a ${p.goals ?? 0}g ${p.assists ?? 0}as  ·  ${p.club ?? '—'}`)
  }
  if (outliers.length > 30) console.log(`  … and ${outliers.length - 30} more`)
  console.log('')
}

// ── Write ────────────────────────────────────────────────────────────────────────
if (!WRITE) {
  console.log('Dry-run complete. No rows written. Re-run with --write once the report looks right.\n')
  process.exit(0)
}

console.log('Writing… first clearing existing source=legacy_import rows (self_reported untouched).')
const { error: delErr } = await supabase.from('career_stats').delete().eq('source', 'legacy_import')
if (delErr) { console.error('Delete failed:', delErr.message); process.exit(1) }

const rows = willWrite.map(w => w.row)
let written = 0
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500)
  const { error: insErr } = await supabase.from('career_stats').insert(chunk)
  if (insErr) { console.error(`Insert failed at chunk ${i}:`, insErr.message); process.exit(1) }
  written += chunk.length
}

console.log(`\n✅ Wrote ${written} career_stats rows (source=legacy_import).`)
console.log(`⚠️  ${unplaceable.length} unplaceable profiles were left for a manual decision — legacy columns still display for them.\n`)
