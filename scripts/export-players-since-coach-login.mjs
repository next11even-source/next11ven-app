/**
 * export-players-since-coach-login.mjs
 *
 * For every approved coach, works out how many approved players joined
 * (profiles.created_at) since that coach last signed in
 * (auth.users.last_sign_in_at). Re-engagement targeting: coaches sitting on
 * a growing pool of players they've never seen.
 *
 * Coaches who have never signed in are counted against their account
 * created_at instead (there is no "last sign in" to anchor to), and flagged
 * never_signed_in = true so they can be filtered separately if needed.
 *
 * Run: node scripts/export-players-since-coach-login.mjs
 * Writes: scripts/out/players-since-coach-login.csv
 */

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
const OUT_PATH = path.join(__dirname, 'out', 'players-since-coach-login.csv')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function listAllAuthUsers() {
  const users = []
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < perPage) break
    page++
  }
  return users
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  console.log('Fetching auth users...')
  const authUsers = await listAllAuthUsers()
  const authById = new Map(authUsers.map(u => [u.id, u]))
  console.log(`  ${authUsers.length} auth users`)

  console.log('Fetching approved profiles...')
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, club, approval_status, created_at')
    .eq('approval_status', 'approved')
    .in('role', ['player', 'coach', 'admin'])

  if (error) throw error

  const players = profiles.filter(p => p.role === 'player' || p.role === 'admin')
  const coaches = profiles.filter(p => p.role === 'coach')
  console.log(`  ${players.length} approved players, ${coaches.length} approved coaches`)

  const rows = coaches.map(coach => {
    const au = authById.get(coach.id)
    const lastSignInAt = au?.last_sign_in_at ?? null
    const neverSignedIn = !lastSignInAt
    // Anchor never-signed-in coaches to their own signup date instead.
    const anchor = lastSignInAt ?? coach.created_at
    const anchorTime = new Date(anchor).getTime()

    const playersSince = players.filter(p => new Date(p.created_at).getTime() > anchorTime).length

    return {
      email: coach.email,
      full_name: coach.full_name,
      club: coach.club,
      last_sign_in_at: lastSignInAt ?? '',
      never_signed_in: neverSignedIn,
      players_joined_since: playersSince,
    }
  }).sort((a, b) => b.players_joined_since - a.players_joined_since)

  console.log(`\nTop 10 by players joined since last login:`)
  for (const r of rows.slice(0, 10)) {
    console.log(`  ${r.players_joined_since.toString().padStart(4)}  ${r.email}${r.never_signed_in ? '  (never signed in)' : ''}`)
  }

  const header = ['email', 'full_name', 'club', 'last_sign_in_at', 'never_signed_in', 'players_joined_since']
  const lines = [
    header.join(','),
    ...rows.map(row => header.map(k => csvEscape(row[k])).join(',')),
  ]

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8')

  console.log(`\nWritten to ${OUT_PATH}`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
