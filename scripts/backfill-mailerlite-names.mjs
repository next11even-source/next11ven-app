/**
 * One-time backfill: split MailerLite subscriber names.
 *
 * Every subscriber created before 23 Aug 2026 had their whole full_name pushed
 * into `fields.name`, which is what a campaign's personalisation token resolves
 * to — so campaigns greeted people "Hi Ryan Bimbi Fikula". This rewrites `name`
 * to the given name and fills `last_name` from profiles.first_name/last_name.
 *
 * ⚠️ Sends ONLY `fields` in the PUT body — never `groups`. lib/mailerlite.ts uses
 * PUT precisely because MailerLite treats it as a data update rather than a
 * group-join event, so existing subscribers don't get re-entered into onboarding
 * automations. Adding `groups` here would risk exactly that, on the whole list.
 *
 * Matches on email. A subscriber with no profile row is skipped, not guessed at.
 *
 *   node scripts/backfill-mailerlite-names.mjs            # dry run, writes nothing
 *   node scripts/backfill-mailerlite-names.mjs --apply    # live
 *   node scripts/backfill-mailerlite-names.mjs --apply --limit 5
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)

const APPLY = process.argv.includes('--apply')
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit')
  return i === -1 ? Infinity : Number(process.argv[i + 1]) || Infinity
})()
// Restrict the run to one address — the canary before touching the whole list.
const ONLY_EMAIL = (() => {
  const i = process.argv.indexOf('--email')
  return i === -1 ? null : (process.argv[i + 1] ?? '').trim().toLowerCase()
})()

const ML = 'https://connect.mailerlite.com/api'
const H = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Authorization: `Bearer ${env.MAILERLITE_API_KEY}`,
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// ── Source of truth: the profiles table, keyed by lowercased email ────────────
const { data: profiles, error } = await sb
  .from('profiles')
  .select('email, first_name, last_name')
if (error) { console.error('supabase error:', error); process.exit(1) }

const byEmail = new Map()
for (const p of profiles) {
  if (p.email) byEmail.set(p.email.trim().toLowerCase(), p)
}
console.log(`profiles loaded: ${byEmail.size}`)

// ── Page through every subscriber ─────────────────────────────────────────────
const subs = []
let cursor = null
do {
  const res = await fetch(`${ML}/subscribers?limit=100${cursor ? `&cursor=${cursor}` : ''}`, { headers: H })
  if (!res.ok) { console.error('list failed', res.status, await res.text()); process.exit(1) }
  const j = await res.json()
  subs.push(...(j.data ?? []))
  cursor = j.meta?.next_cursor ?? null
} while (cursor)
console.log(`subscribers fetched: ${subs.length}`)

// ── Work out what actually needs changing ─────────────────────────────────────
const todo = []
const stats = { alreadyCorrect: 0, noProfile: 0, noName: 0 }

for (const s of subs) {
  if (ONLY_EMAIL && (s.email ?? '').trim().toLowerCase() !== ONLY_EMAIL) continue
  const profile = byEmail.get((s.email ?? '').trim().toLowerCase())
  if (!profile) { stats.noProfile++; continue }
  if (!profile.first_name) { stats.noName++; continue }

  const wantName = profile.first_name
  const wantLast = profile.last_name ?? ''
  const haveName = (s.fields?.name ?? '') || ''
  const haveLast = (s.fields?.last_name ?? '') || ''

  if (haveName === wantName && haveLast === wantLast) { stats.alreadyCorrect++; continue }
  todo.push({ id: s.id, email: s.email, from: `${haveName}|${haveLast}`, to: `${wantName}|${wantLast}`, wantName, wantLast })
}

console.log(`\nalready correct : ${stats.alreadyCorrect}`)
console.log(`no profile row  : ${stats.noProfile}  (skipped, not guessed)`)
console.log(`no first_name   : ${stats.noName}  (skipped)`)
console.log(`TO UPDATE       : ${todo.length}`)
console.log('\nfirst 10 changes:')
for (const t of todo.slice(0, 10)) console.log(`  ${t.email}\n    "${t.from}" -> "${t.to}"`)

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply to commit.')
  process.exit(0)
}

// ── Apply, serially and gently — this is someone's live mailing list ──────────
const batch = todo.slice(0, LIMIT)
console.log(`\nAPPLYING to ${batch.length} subscriber(s)...`)

const sleep = ms => new Promise(r => setTimeout(r, ms))

// MailerLite allows 120 requests/minute — i.e. one per 500ms. An earlier run at
// 120ms got 434 of 901 rejected with 429, so pace at 600ms and honour Retry-After
// on the ones that still bounce. The whole list takes ~10 minutes; that is the
// correct trade for not having to reconcile a half-applied mailing list.
const GAP_MS = 600
const MAX_ATTEMPTS = 5

async function putName(t) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`${ML}/subscribers/${t.id}`, {
      method: 'PUT',
      headers: H,
      // fields ONLY — see the header comment. Never send `groups` here.
      body: JSON.stringify({ fields: { name: t.wantName, last_name: t.wantLast } }),
    })
    if (res.ok) return { ok: true }
    if (res.status !== 429) return { ok: false, detail: `(${res.status}) ${await res.text()}` }

    // Rate limited — wait what the server asks for, backing off if it doesn't say.
    const retryAfter = Number(res.headers.get('retry-after'))
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(60000, 2000 * 2 ** (attempt - 1))
    console.log(`    429 on ${t.email} — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`)
    await sleep(waitMs)
  }
  return { ok: false, detail: '(429) still rate limited after retries' }
}

let ok = 0
const failures = []
for (const [i, t] of batch.entries()) {
  const result = await putName(t)
  if (result.ok) ok++
  else failures.push(`${t.email} ${result.detail}`)

  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${batch.length}...`)
  await sleep(GAP_MS)
}

console.log(`\nupdated: ${ok}/${batch.length}`)
if (failures.length) {
  console.log(`failures: ${failures.length}`)
  console.log(failures.slice(0, 10).join('\n'))
}
