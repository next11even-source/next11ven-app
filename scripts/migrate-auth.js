/**
 * SCRIPT 1: migrate-auth.js
 * Creates Supabase auth accounts for every user in the Glide CSV export.
 * Outputs scripts/user-id-map.json: { "email": "uuid" }
 *
 * Run: node scripts/migrate-auth.js
 */

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const { createClient } = require('@supabase/supabase-js')

const CSV_PATH = path.join(__dirname, 'data', 'main_player_table.csv')
const MAP_PATH = path.join(__dirname, 'user-id-map.json')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  const raw = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  })

  console.log(`\nTotal rows parsed: ${rows.length}`)
  console.log('\n--- First 3 rows (column check) ---')
  rows.slice(0, 3).forEach((r, i) => {
    console.log(`\nRow ${i + 1}:`)
    console.log(`  Full Name:    ${r['Full Name']}`)
    console.log(`  Email:        ${r['email']}`)
    console.log(`  Account Type: ${r['Account Type']}`)
    console.log(`  Timestamp:    ${r['Timestamp']}`)
  })
  console.log('\n-----------------------------------\n')

  // Load existing map if re-running
  let idMap = {}
  if (fs.existsSync(MAP_PATH)) {
    idMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
    console.log(`Loaded existing user-id-map.json with ${Object.keys(idMap).length} entries\n`)
  }

  // Fetch all existing auth users so we can skip them
  console.log('Fetching existing auth users from Supabase...')
  const existingEmails = new Set()
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) { console.error('Failed to list users:', error.message); process.exit(1) }
    data.users.forEach(u => {
      existingEmails.add(u.email.toLowerCase())
      idMap[u.email.toLowerCase()] = u.id
    })
    if (data.users.length < 1000) break
    page++
  }
  console.log(`Found ${existingEmails.size} existing auth users\n`)

  let created = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    const email = (row['email'] || '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      console.warn(`SKIP — invalid email: "${email}" (${row['Full Name']})`)
      skipped++
      continue
    }

    if (existingEmails.has(email)) {
      console.log(`SKIP — already exists: ${email}`)
      skipped++
      continue
    }

    try {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        password: undefined,
      })

      if (error) {
        console.error(`FAIL — ${email}: ${error.message}`)
        failed++
        continue
      }

      idMap[email] = data.user.id
      existingEmails.add(email)
      console.log(`CREATED — ${email} → ${data.user.id}`)
      created++
    } catch (err) {
      console.error(`FAIL — ${email}: ${err.message}`)
      failed++
    }
  }

  fs.writeFileSync(MAP_PATH, JSON.stringify(idMap, null, 2))

  console.log('\n========== AUTH MIGRATION COMPLETE ==========')
  console.log(`  Created : ${created}`)
  console.log(`  Skipped : ${skipped}`)
  console.log(`  Failed  : ${failed}`)
  console.log(`  Map written to: ${MAP_PATH}`)
  console.log('=============================================\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
