/**
 * cleanup-tracker-demo.mjs
 *
 * Reverses seed-tracker-demo.mjs: removes the seeded Game Performance Tracker
 * record for the demo account (default: Reece Smith / test123@next11ven.com)
 * once the marketing screenshots have been taken, so the test user stops
 * polluting analytics.
 *
 * What it removes (only for the one resolved demo player id):
 *   - performance_matches, club_stints, career_stats, performance_targets
 *   - resets the analytics-skewing profile flags back to false:
 *       premium, actively_looking, performance_stats_public,
 *       performance_include_preseason
 *
 * It deliberately does NOT touch the seeded display fields (club, level, bio,
 * position, status) — those don't affect analytics counts.
 *
 * SAFE BY DEFAULT: dry-run (prints what it would remove, writes nothing) unless
 * you pass --write. Only ever touches the one demo player id resolved from
 * --email.
 *
 * Run from the project root (.env.local has multi-line values, so load it with
 * dotenv rather than `source`):
 *   node -r dotenv/config scripts/cleanup-tracker-demo.mjs dotenv_config_path=.env.local
 *   node -r dotenv/config scripts/cleanup-tracker-demo.mjs dotenv_config_path=.env.local --write
 */

import { createClient } from '@supabase/supabase-js'

const WRITE = process.argv.includes('--write')

const emailArg = process.argv.find(a => a.startsWith('--email='))
const EMAIL = emailArg ? emailArg.split('=')[1] : 'test123@next11ven.com'

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error('Missing env vars. Load .env.local via dotenv (see header).')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE, {
  auth: { persistSession: false },
})

const TRACKER_TABLES = ['performance_matches', 'club_stints', 'career_stats', 'performance_targets']

const FLAG_RESET = {
  premium: false,
  actively_looking: false,
  performance_stats_public: false,
  performance_include_preseason: false,
}

async function main() {
  console.log(`\n${WRITE ? 'WRITE' : 'DRY-RUN'} — cleaning up tracker demo data for ${EMAIL}\n`)

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, premium, actively_looking, performance_stats_public, performance_include_preseason')
    .eq('email', EMAIL)
    .single()

  if (profErr || !profile) {
    console.error(`Could not find a profile for ${EMAIL}:`, profErr?.message)
    process.exit(1)
  }
  if (profile.role !== 'player' && profile.role !== 'admin') {
    console.error(`${EMAIL} is a ${profile.role}, not a player. Refusing to touch it.`)
    process.exit(1)
  }

  const playerId = profile.id
  console.log(`  Player: ${profile.full_name} (${playerId})`)

  // Count what's there before we remove it.
  for (const table of TRACKER_TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
    if (error) throw new Error(`Failed counting ${table}: ${error.message}`)
    console.log(`    ${table}: ${count ?? 0} row(s)`)
  }

  console.log('\n  Current flags:')
  for (const key of Object.keys(FLAG_RESET)) {
    console.log(`    ${key}: ${profile[key]} → ${FLAG_RESET[key]}`)
  }

  if (!WRITE) {
    console.log('\n  Dry-run only. Re-run with --write to apply.\n')
    return
  }

  // Matches first (stint_id FK), then the rest.
  for (const table of TRACKER_TABLES) {
    const { error } = await supabase.from(table).delete().eq('player_id', playerId)
    if (error) throw new Error(`Failed clearing ${table}: ${error.message}`)
  }
  console.log('\n  Cleared tracker rows.')

  const { error: patchErr } = await supabase
    .from('profiles')
    .update({ ...FLAG_RESET, updated_at: new Date().toISOString() })
    .eq('id', playerId)
  if (patchErr) throw new Error(`Failed resetting flags: ${patchErr.message}`)
  console.log('  Reset analytics flags.')

  console.log('\n  Done.\n')
}

main().catch(err => {
  console.error('\n', err.message, '\n')
  process.exit(1)
})
