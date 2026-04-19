/**
 * SCRIPT 3: check-migration.js
 * Verifies data integrity after migration.
 *
 * Run: node scripts/check-migration.js
 */

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const MAP_PATH = path.join(__dirname, 'user-id-map.json')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function row(label, value, warn = false) {
  const pad = label.padEnd(35, '.')
  const prefix = warn ? '⚠️  ' : '   '
  console.log(`${prefix}${pad} ${value}`)
}

async function main() {
  console.log('\n========== MIGRATION CHECK ==========\n')

  // Total profiles
  const { count: total } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
  row('Total profiles', total)

  // By role
  for (const role of ['player', 'coach', 'fan', 'admin']) {
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', role)
    row(`  Role: ${role}`, count ?? 0)
  }

  console.log()

  // Approved
  const { count: approved } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('approved', true)
  row('Approved = true', approved, approved !== total)

  // Has avatar_url
  const { count: hasAvatar } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .not('avatar_url', 'is', null)
  row('Has avatar_url', hasAvatar)

  // Has position (players only)
  const { count: hasPosition } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .not('position', 'is', null)
  row('Has position set', hasPosition)

  // Has phone
  const { count: hasPhone } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .not('phone', 'is', null)
  row('Has phone', hasPhone)

  // Has date_of_birth
  const { count: hasDob } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .not('date_of_birth', 'is', null)
  row('Has date_of_birth', hasDob)

  console.log()

  // Check id-map entries against profiles
  if (!fs.existsSync(MAP_PATH)) {
    console.log('user-id-map.json not found — skipping map check\n')
    return
  }

  const idMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
  const emails = Object.keys(idMap)
  console.log(`Checking ${emails.length} emails from user-id-map.json against profiles...\n`)

  const missing = []
  // Fetch all profile IDs in one query
  const { data: profileRows } = await supabase
    .from('profiles')
    .select('id, email')

  const profileIdSet = new Set((profileRows || []).map(p => p.id))

  for (const [email, uuid] of Object.entries(idMap)) {
    if (!profileIdSet.has(uuid)) {
      missing.push({ email, uuid })
    }
  }

  if (missing.length === 0) {
    row('Orphaned auth accounts (no profile)', 0)
  } else {
    row('Orphaned auth accounts (no profile)', missing.length, true)
    console.log('\n  Emails with auth account but no profile row:')
    missing.forEach(({ email, uuid }) => console.log(`    - ${email} (${uuid})`))
  }

  console.log('\n=====================================\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
