/**
 * export-never-signed-in.mjs
 *
 * Exports every approved player/coach who has NEVER signed into the new app
 * (auth.users.last_sign_in_at IS NULL) — the re-engagement target list.
 * Same "migrated" definition used by analytics_platform_stats().ever_signed_in.
 *
 * Run: node scripts/export-never-signed-in.mjs
 * Writes: scripts/out/never-signed-in.csv
 */

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })
const OUT_PATH = path.join(__dirname, 'out', 'never-signed-in.csv')

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
  console.log(`  ${authUsers.length} auth users`)

  console.log('Fetching approved player/coach profiles...')
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, full_name, first_name, last_name, role, club, approval_status, created_at')
    .eq('approval_status', 'approved')
    .in('role', ['player', 'coach', 'admin'])

  if (profilesError) throw profilesError
  console.log(`  ${profiles.length} approved profiles`)

  const authById = new Map(authUsers.map(u => [u.id, u]))

  const neverSignedIn = profiles
    .filter(p => {
      const au = authById.get(p.id)
      return au && !au.last_sign_in_at
    })
    .map(p => ({
      email: p.email,
      full_name: p.full_name,
      role: p.role,
      club: p.club,
      created_at: p.created_at,
    }))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  console.log(`\n${neverSignedIn.length} approved users have never signed in\n`)

  const header = ['email', 'full_name', 'role', 'club', 'created_at']
  const lines = [
    header.join(','),
    ...neverSignedIn.map(row => header.map(k => csvEscape(row[k])).join(',')),
  ]

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, lines.join('\n') + '\n', 'utf8')

  console.log(`Written to ${OUT_PATH}`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
