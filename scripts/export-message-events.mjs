/**
 * export-message-events.mjs
 *
 * Exports event-level messaging/connection data for the churn-vs-contact
 * analysis (Stripe churn timeline joined on email).
 *
 * Writes two CSVs to scripts/out/:
 *   1. message-events.csv — one row per message_sent + one row per
 *      connection_made, Jun 2025 -> present, player + coach roles.
 *   2. user-roster.csv — one row per approved player/coach profile
 *      (full roster, not time-boxed by signup date, so pre-Jun-2025
 *      signups who are still active aren't silently dropped from the join).
 *
 * Event semantics (confirmed with founder 29 Aug 2026):
 *   - message_sent: user_id = RECIPIENT of the message (not the sender).
 *     counterpart_role = the sender's role. This is what makes "did this
 *     player receive a coach message in month X" directly queryable —
 *     a sender-keyed row with only a counterpart *role* (no id) can't be
 *     traced to which specific player was on the other end.
 *   - connection_made: fires once per conversation, the moment it first
 *     reaches 2 total messages (the "2+ messages, real contact" bar).
 *     Connection is mutual, so it's emitted as TWO rows (one per
 *     participant), each with the other's role as counterpart_role, both
 *     timestamped at the message that crossed the threshold.
 *
 * Seed/test accounts (lib/hiddenProfiles.ts) are excluded from both files.
 *
 * Run: node scripts/export-message-events.mjs
 * Writes: scripts/out/message-events.csv, scripts/out/user-roster.csv
 */

import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const OUT_DIR = path.join(__dirname, 'out')
const EVENTS_PATH = path.join(OUT_DIR, 'message-events.csv')
const ROSTER_PATH = path.join(OUT_DIR, 'user-roster.csv')

const SCOPE_START = '2025-06-01T00:00:00.000Z'

// Seed/test accounts — keep out of an analysis dataset (see lib/hiddenProfiles.ts)
const HIDDEN_PROFILE_IDS = new Set(['bb3e7645-be4c-40ce-920e-0aa4b5519367'])

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function writeCsv(filePath, header, rows) {
  const lines = [
    header.join(','),
    ...rows.map(row => header.map(k => csvEscape(row[k])).join(',')),
  ]
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8')
}

async function fetchAllRows(table, select, applyFilters) {
  const rows = []
  const pageSize = 1000
  let from = 0
  while (true) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (applyFilters) query = applyFilters(query)
    const { data, error } = await query
    if (error) throw error
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function main() {
  console.log('Fetching player/coach roster...')
  const profiles = await fetchAllRows(
    'profiles',
    'id, email, role, created_at, approved',
    q => q.in('role', ['player', 'coach']).eq('approved', true)
  )
  const roster = profiles.filter(p => !HIDDEN_PROFILE_IDS.has(p.id))
  const profileById = new Map(roster.map(p => [p.id, p]))
  console.log(`  ${roster.length} approved player/coach profiles`)

  console.log('Fetching conversations...')
  const allConversations = await fetchAllRows(
    'conversations',
    'id, coach_id, player_id, created_at',
    q => q.gte('created_at', SCOPE_START)
  )
  const conversations = allConversations.filter(
    c => !HIDDEN_PROFILE_IDS.has(c.coach_id) && !HIDDEN_PROFILE_IDS.has(c.player_id)
  )
  const conversationById = new Map(conversations.map(c => [c.id, c]))
  console.log(`  ${conversations.length} conversations since ${SCOPE_START}`)

  console.log('Fetching messages...')
  const conversationIds = new Set(conversations.map(c => c.id))
  const allMessages = await fetchAllRows(
    'messages',
    'id, conversation_id, sender_id, created_at',
    q => q.gte('created_at', SCOPE_START).order('conversation_id', { ascending: true }).order('created_at', { ascending: true })
  )
  const messages = allMessages.filter(m => conversationIds.has(m.conversation_id))
  console.log(`  ${messages.length} messages since ${SCOPE_START}`)

  const events = []
  const messagesByConversation = new Map()
  for (const m of messages) {
    if (!messagesByConversation.has(m.conversation_id)) messagesByConversation.set(m.conversation_id, [])
    messagesByConversation.get(m.conversation_id).push(m)
  }

  for (const [conversationId, convoMessages] of messagesByConversation) {
    const convo = conversationById.get(conversationId)
    if (!convo) continue

    // sort defensively — Supabase order-by-multiple-columns across a
    // paginated range() fetch isn't guaranteed stable across pages
    convoMessages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

    for (const msg of convoMessages) {
      const senderIsCoach = msg.sender_id === convo.coach_id
      const senderIsPlayer = msg.sender_id === convo.player_id
      if (!senderIsCoach && !senderIsPlayer) continue // sender not a recognised participant (e.g. admin) — skip

      const recipientId = senderIsCoach ? convo.player_id : convo.coach_id
      const recipientProfile = profileById.get(recipientId)
      const senderProfile = profileById.get(msg.sender_id)
      if (!recipientProfile || !senderProfile) continue // hidden/unapproved participant

      events.push({
        user_id: recipientProfile.id,
        email: recipientProfile.email,
        role: recipientProfile.role,
        event_type: 'message_sent',
        counterpart_role: senderProfile.role,
        timestamp: msg.created_at,
      })
    }

    // connection_made: first moment this conversation reaches 2 total messages
    if (convoMessages.length >= 2) {
      const thresholdMsg = convoMessages[1]
      const coachProfile = profileById.get(convo.coach_id)
      const playerProfile = profileById.get(convo.player_id)
      if (coachProfile && playerProfile) {
        events.push({
          user_id: coachProfile.id,
          email: coachProfile.email,
          role: coachProfile.role,
          event_type: 'connection_made',
          counterpart_role: playerProfile.role,
          timestamp: thresholdMsg.created_at,
        })
        events.push({
          user_id: playerProfile.id,
          email: playerProfile.email,
          role: playerProfile.role,
          event_type: 'connection_made',
          counterpart_role: coachProfile.role,
          timestamp: thresholdMsg.created_at,
        })
      }
    }
  }

  events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
  console.log(`  ${events.filter(e => e.event_type === 'message_sent').length} message_sent events`)
  console.log(`  ${events.filter(e => e.event_type === 'connection_made').length} connection_made events`)

  const rosterRows = roster
    .map(p => ({
      user_id: p.id,
      email: p.email,
      role: p.role,
      signup_date: p.created_at,
    }))
    .sort((a, b) => new Date(a.signup_date) - new Date(b.signup_date))

  fs.mkdirSync(OUT_DIR, { recursive: true })
  writeCsv(EVENTS_PATH, ['user_id', 'email', 'role', 'event_type', 'counterpart_role', 'timestamp'], events)
  writeCsv(ROSTER_PATH, ['user_id', 'email', 'role', 'signup_date'], rosterRows)

  console.log(`\nWritten:`)
  console.log(`  ${EVENTS_PATH} (${events.length} rows)`)
  console.log(`  ${ROSTER_PATH} (${rosterRows.length} rows)`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
