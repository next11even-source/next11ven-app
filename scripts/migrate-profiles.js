/**
 * SCRIPT 2: migrate-profiles.js
 * Inserts profile rows into Supabase for all users in the Glide CSV.
 * Requires user-id-map.json to exist (run migrate-auth.js first).
 *
 * Run: node scripts/migrate-profiles.js
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(raw) {
  if (!raw || !raw.trim()) return null
  const s = raw.trim()
  // M/D/YY or M/D/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  let [, month, day, year] = m
  if (year.length === 2) year = parseInt(year) > 30 ? `19${year}` : `20${year}`
  const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function parseTimestamp(raw) {
  if (!raw || !raw.trim()) return null
  const d = new Date(raw.trim())
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

function parseInt2(raw) {
  if (!raw || !raw.trim()) return null
  const n = parseInt(raw.trim().replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? null : n
}

function normaliseStatus(raw) {
  if (!raw || !raw.trim()) return 'just_exploring'
  const s = raw.trim().toLowerCase()
  if (s.includes('signed')) return 'signed'
  if (s.includes('free agent')) return 'free_agent'
  if (s.includes('loan') || s.includes('dual')) return 'loan_dual_reg'
  if (s.includes('just exploring') || s.includes('just_exploring')) return 'just_exploring'
  if (s.includes('open')) return 'just_exploring'
  return 'just_exploring'
}

function mapRole(accountType) {
  const t = (accountType || '').trim()
  if (t === 'Player') return 'player'
  if (t === 'Coaching Staff') return 'coach'
  if (t === 'Fan') return 'fan'
  return null
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(MAP_PATH)) {
    console.error('user-id-map.json not found — run migrate-auth.js first')
    process.exit(1)
  }

  const idMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
  console.log(`Loaded user-id-map.json: ${Object.keys(idMap).length} entries`)

  const raw = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  })

  console.log(`Total rows parsed: ${rows.length}`)
  console.log('\n--- First 3 rows (column check) ---')
  rows.slice(0, 3).forEach((r, i) => {
    console.log(`\nRow ${i + 1}:`)
    console.log(`  Full Name:     ${r['Full Name']}`)
    console.log(`  Account Type:  ${r['Account Type']}`)
    console.log(`  Role mapped:   ${mapRole(r['Account Type'])}`)
    console.log(`  DOB raw:       ${r['Date of birth:']}`)
    console.log(`  DOB parsed:    ${parseDate(r['Date of birth:'])}`)
    console.log(`  Status raw:    ${r['Current Status']}`)
    console.log(`  Status mapped: ${normaliseStatus(r['Current Status'])}`)
    console.log(`  GDPR:          ${r['✅ I understand and accept that the information I have provided in this survey may be stored and shared through the NEXT11VEN platform for the purpose of connecting players with managers, clubs and scouts.  I give permission for parts of my profile to be visible to clubs, coaches, and (where applicable) the public. I understand that sensitive preferences will not be shared.  The information I have provided is accurate, and agree to the storage and use of my data as outlined above. I may request to have my data removed at any time.']}`)
  })
  console.log('\n-----------------------------------\n')

  const GDPR_COL = '✅ I understand and accept that the information I have provided in this survey may be stored and shared through the NEXT11VEN platform for the purpose of connecting players with managers, clubs and scouts.  I give permission for parts of my profile to be visible to clubs, coaches, and (where applicable) the public. I understand that sensitive preferences will not be shared.  The information I have provided is accurate, and agree to the storage and use of my data as outlined above. I may request to have my data removed at any time.'

  let inserted = 0
  let skipped = 0
  let failed = 0
  const base64Emails = []

  for (const row of rows) {
    const email = (row['email'] || '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      console.warn(`SKIP — invalid email: "${email}"`)
      skipped++
      continue
    }

    const id = idMap[email]
    if (!id) {
      console.warn(`SKIP — not in id map: ${email}`)
      skipped++
      continue
    }

    const role = mapRole(row['Account Type'])
    if (!role) {
      console.warn(`SKIP — unknown account type: "${row['Account Type']}" (${email})`)
      skipped++
      continue
    }

    const phone = row['Phone Number'] ? row['Phone Number'].trim() || null : null
    const gdprRaw = (row[GDPR_COL] || '').toLowerCase()
    const gdprConsent = gdprRaw.includes('agree')

    // Avatar — detect base64 and null it out
    const avatarRaw = (row['Profile Picture'] || '').trim()
    let avatarUrl = avatarRaw || null
    if (avatarRaw.startsWith('data:image')) {
      avatarUrl = null
      base64Emails.push(email)
      console.warn(`BASE64 avatar — nulled for: ${email}`)
    }

    // Highlight URL — wrap in array if present
    const highlightRaw = (row['Highlight reel link (we will link this to your profile). Upload to Youtube and provide us with the url'] || '').trim()
    const highlightUrls = highlightRaw ? [highlightRaw] : []

    // Base profile — all roles
    const profile = {
      id,
      email,
      full_name: row['Full Name'] ? row['Full Name'].trim() : null,
      role,
      city: row['Location (nearest City)'] ? row['Location (nearest City)'].trim() || null : null,
      phone,
      date_of_birth: parseDate(row['Date of birth:']),
      approved: true,
      approval_status: 'approved',
      is_active: true,
      premium: false,
      gdpr_consent: gdprConsent,
      sms_opt_in: !!phone,
      created_at: parseTimestamp(row['Timestamp']),
    }

    if (role === 'player' || role === 'coach') {
      profile.position = row['What is your best position?'] ? row['What is your best position?'].trim() || null : null
      profile.secondary_position = row['What is your secondary position? (Choose 1)'] ? row['What is your secondary position? (Choose 1)'].trim() || null : null
      profile.playing_level = row['What is the most recent level you have played first team football at?'] ? row['What is the most recent level you have played first team football at?'].trim() || null : null
      profile.club = row["Current Club (or 'Free Agent')"] ? row["Current Club (or 'Free Agent')"].trim() || null : null
      profile.foot = row['Strongest foot?'] ? row['Strongest foot?'].trim() || null : null
      profile.status = normaliseStatus(row['Current Status'])
      profile.highlight_urls = highlightUrls
      profile.avatar_url = avatarUrl
      profile.season = row['Season'] ? row['Season'].trim() || null : null
      profile.appearances = parseInt2(row['Games Played'])
      profile.goals = parseInt2(row['Goals Scored'])
      profile.assists = parseInt2(row['Assists'])
    }

    if (role === 'coach') {
      profile.coaching_role = row['What is your role?'] ? row['What is your role?'].trim() || null : null
      profile.coaching_level = row['What is the most recent level you have managed/coached first team football at?'] ? row['What is the most recent level you have managed/coached first team football at?'].trim() || null : null
      profile.coaching_history = row['Coaching History: List your previous clubs'] ? row['Coaching History: List your previous clubs'].trim() || null : null
    }

    try {
      const { error } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' })
      if (error) {
        console.error(`FAIL — ${email}: ${error.message}`)
        failed++
        continue
      }
      console.log(`OK — ${email} (${role})`)
      inserted++
    } catch (err) {
      console.error(`FAIL — ${email}: ${err.message}`)
      failed++
    }
  }

  console.log('\n========== PROFILE MIGRATION COMPLETE ==========')
  console.log(`  Inserted/updated : ${inserted}`)
  console.log(`  Skipped          : ${skipped}`)
  console.log(`  Failed           : ${failed}`)
  if (base64Emails.length > 0) {
    console.log(`\n  Base64 avatars nulled (${base64Emails.length}) — manual upload needed:`)
    base64Emails.forEach(e => console.log(`    - ${e}`))
  }
  console.log('=================================================\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
