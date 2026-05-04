require('dotenv').config({ path: '.env.local' })

const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const { createClient } = require('@supabase/supabase-js')

const CSV_PATH = path.join(__dirname, 'data', 'messages.csv')
const MAP_PATH = path.join(__dirname, 'user-id-map.json')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCreatedAt(raw) {
  if (!raw || !raw.trim()) return null
  const d = new Date(raw.trim())
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function randomTimestampIn2025() {
  const start = new Date('2025-01-01T00:00:00Z').getTime()
  const end = new Date('2025-12-31T23:59:59Z').getTime()
  return new Date(start + Math.random() * (end - start)).toISOString()
}

function normaliseEmail(e) {
  return (e || '').trim().toLowerCase()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // ── Load inputs ─────────────────────────────────────────────────────────────
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`ERROR: CSV not found at ${CSV_PATH}`)
    process.exit(1)
  }
  if (!fs.existsSync(MAP_PATH)) {
    console.error(`ERROR: user-id-map.json not found at ${MAP_PATH}`)
    process.exit(1)
  }

  const csvRaw = fs.readFileSync(CSV_PATH, 'utf8')
  const rows = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  })

  const userMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
  // Normalise all keys to lowercase for safe lookup
  const normalisedMap = {}
  for (const [email, uuid] of Object.entries(userMap)) {
    normalisedMap[normaliseEmail(email)] = uuid
  }

  console.log(`\nLoaded ${rows.length} rows from CSV`)
  console.log(`Loaded ${Object.keys(normalisedMap).length} entries from user-id-map.json\n`)

  // ── Preview first 3 rows ────────────────────────────────────────────────────
  console.log('── First 3 parsed rows (for mapping verification) ──────────────────')
  rows.slice(0, 3).forEach((r, i) => {
    const ce = normaliseEmail(r['CoachEmail'])
    const pe = normaliseEmail(r['PlayerEmail'])
    console.log(`[${i + 1}] Coach: "${r['Coach Name']}" <${ce}> → ${normalisedMap[ce] ?? 'NOT IN MAP'}`)
    console.log(`     Player: "${r['Player Name']}" <${pe}> → ${normalisedMap[pe] ?? 'NOT IN MAP'}`)
    console.log(`     Message: "${(r['Message'] || '').slice(0, 80)}${r['Message']?.length > 80 ? '…' : ''}"`)
    console.log(`     CreatedAt: "${r['CreatedAt'] || '(empty)'}"`)
  })
  console.log('────────────────────────────────────────────────────────────────────\n')

  // ── Counters ────────────────────────────────────────────────────────────────
  let skippedNotInMap = 0
  let skippedEmptyMessage = 0
  let conversationsCreated = 0
  let conversationsReused = 0
  let messagesInserted = 0
  const failedInserts = []

  // ── Filter and group rows by coach+player pair ───────────────────────────────
  // Map: "coachEmail|playerEmail" → { coach_uuid, player_uuid, messages[] }
  const grouped = new Map()

  for (const row of rows) {
    const coachEmail = normaliseEmail(row['CoachEmail'])
    const playerEmail = normaliseEmail(row['PlayerEmail'])
    const message = (row['Message'] || '').trim()

    const coachUuid = normalisedMap[coachEmail]
    const playerUuid = normalisedMap[playerEmail]

    if (!coachUuid || !playerUuid) {
      skippedNotInMap++
      console.log(`SKIPPED: ${coachEmail || '(empty)'} or ${playerEmail || '(empty)'} not found in user map`)
      continue
    }

    if (!message) {
      skippedEmptyMessage++
      continue
    }

    const key = `${coachEmail}|${playerEmail}`
    if (!grouped.has(key)) {
      grouped.set(key, { coach_uuid: coachUuid, player_uuid: playerUuid, messages: [] })
    }
    grouped.get(key).messages.push({
      content: row['Message'],
      createdAt: parseCreatedAt(row['CreatedAt']),
    })
  }

  console.log(`\nValid conversation groups: ${grouped.size}`)
  console.log(`Skipped (not in map): ${skippedNotInMap}`)
  console.log(`Skipped (empty message): ${skippedEmptyMessage}\n`)

  // ── Process each conversation group ─────────────────────────────────────────
  for (const [key, { coach_uuid, player_uuid, messages }] of grouped.entries()) {
    let conversationId

    try {
      // Check if conversation already exists
      const { data: existing, error: lookupError } = await supabase
        .from('conversations')
        .select('id')
        .eq('coach_id', coach_uuid)
        .eq('player_id', player_uuid)
        .maybeSingle()

      if (lookupError) throw lookupError

      if (existing) {
        conversationId = existing.id
        conversationsReused++
      } else {
        // Determine last_message_at from the most recent message with a date,
        // or fall back to now()
        const latestKnown = messages
          .map(m => m.createdAt)
          .filter(Boolean)
          .sort()
          .at(-1)

        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            coach_id: coach_uuid,
            player_id: player_uuid,
            initiated_by: coach_uuid,
            last_message_at: latestKnown ?? new Date().toISOString(),
          })
          .select('id')
          .single()

        if (convError) throw convError
        conversationId = newConv.id
        conversationsCreated++
      }
    } catch (err) {
      console.error(`ERROR creating/finding conversation for ${key}: ${err.message}`)
      failedInserts.push({ key, reason: `conversation: ${err.message}` })
      continue
    }

    // ── Insert messages ────────────────────────────────────────────────────
    const now = new Date().toISOString()

    for (const msg of messages) {
      try {
        const timestamp = msg.createdAt ?? randomTimestampIn2025()

        const { error: msgError } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: coach_uuid,
            content: msg.content,
            created_at: timestamp,
            read_at: now,
          })

        if (msgError) throw msgError
        messagesInserted++
      } catch (err) {
        console.error(`ERROR inserting message for ${key}: ${err.message}`)
        failedInserts.push({ key, reason: `message: ${err.message}` })
      }
    }

    // ── Update conversation last_message_at to latest message ──────────────
    try {
      const latestTs = messages
        .map(m => m.createdAt ?? randomTimestampIn2025())
        .sort()
        .at(-1)

      await supabase
        .from('conversations')
        .update({ last_message_at: latestTs })
        .eq('id', conversationId)
    } catch (err) {
      console.error(`WARN: could not update last_message_at for conversation ${conversationId}: ${err.message}`)
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════')
  console.log('Migration complete:')
  console.log(`  ${conversationsCreated} conversations created`)
  console.log(`  ${conversationsReused} conversations reused`)
  console.log(`  ${messagesInserted} messages inserted`)
  console.log(`  ${skippedNotInMap} rows skipped (email not in map)`)
  console.log(`  ${skippedEmptyMessage} rows skipped (empty message)`)
  if (failedInserts.length > 0) {
    console.log(`  ${failedInserts.length} failed inserts:`)
    failedInserts.forEach(f => console.log(`    • ${f.key} — ${f.reason}`))
  }
  console.log('════════════════════════════════════════\n')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
