/**
 * backfill-premium.mjs
 *
 * Syncs all active Stripe subscriptions into Supabase.
 * Matches customers to profiles by email, sets premium=true,
 * stores stripe_customer_id, and writes to the subscriptions table.
 *
 * Run once from the project root:
 *   node scripts/backfill-premium.mjs
 */

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// ─── Config ───────────────────────────────────────────────────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error('Missing env vars. Run: source .env.local first, or prefix with env vars.')
  console.error('  STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)

// Price IDs that count as "player" — includes the legacy £5 price
const PLAYER_PRICE_IDS = new Set([
  'next11ven-player-premium-upgrade-membership-29485', // new £6.99
  'next11ven-premium-membership-27980',                // legacy £5
])
const COACH_PRICE_IDS = new Set([
  'next11ven-coach-premium-membership-28175',          // £10
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoleFromPriceId(priceId) {
  if (PLAYER_PRICE_IDS.has(priceId)) return 'player'
  if (COACH_PRICE_IDS.has(priceId))  return 'coach'
  return null
}

async function fetchAllActiveSubscriptions() {
  const subs = []
  let page = await stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.customer'] })
  subs.push(...page.data)
  while (page.has_more) {
    page = await stripe.subscriptions.list({ status: 'active', limit: 100, starting_after: subs[subs.length - 1].id, expand: ['data.customer'] })
    subs.push(...page.data)
  }
  return subs
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('=== NEXT11VEN Premium Backfill ===\n')

const allSubs = await fetchAllActiveSubscriptions()
console.log(`Found ${allSubs.length} active subscriptions in Stripe.\n`)

// Deduplicate by customer — if a customer has multiple active subs,
// use the most recent one (already sorted descending by Stripe)
const seenCustomers = new Map()
for (const sub of allSubs) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  if (!seenCustomers.has(customerId)) {
    seenCustomers.set(customerId, sub)
  } else {
    console.warn(`  ⚠ Duplicate active sub for customer ${customerId} — keeping ${seenCustomers.get(customerId).id}, skipping ${sub.id}`)
  }
}

console.log(`Processing ${seenCustomers.size} unique customers...\n`)

let matched = 0
let unmatched = 0
let errors = 0

for (const [customerId, sub] of seenCustomers) {
  const customer = typeof sub.customer === 'object' ? sub.customer : null
  const email = customer?.email?.toLowerCase()?.trim()
  const priceId = sub.items.data[0]?.price?.id ?? null
  const role = getRoleFromPriceId(priceId)

  if (!email) {
    console.warn(`  ✗ No email for customer ${customerId} (sub ${sub.id}) — skipping`)
    unmatched++
    continue
  }

  // Find profile by email
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, premium, role')
    .ilike('email', email)
    .single()

  if (profileErr || !profile) {
    console.warn(`  ✗ No profile found for ${email} (customer ${customerId})`)
    unmatched++
    continue
  }

  // Update profile: premium=true, store customer ID
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({
      premium: true,
      stripe_customer_id: customerId,
    })
    .eq('id', profile.id)

  if (updateErr) {
    console.error(`  ✗ Failed to update profile for ${email}:`, updateErr.message)
    errors++
    continue
  }

  // Upsert into subscriptions table
  const { error: subErr } = await supabase.from('subscriptions').upsert({
    user_id: profile.id,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    stripe_price_id: priceId,
    role: role ?? profile.role,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'stripe_subscription_id' })

  if (subErr) {
    console.error(`  ✗ Failed to upsert subscription for ${email}:`, subErr.message)
    errors++
    continue
  }

  const wasAlready = profile.premium ? ' (was already premium)' : ''
  console.log(`  ✓ ${email} → premium=true | ${priceId} | sub ${sub.id}${wasAlready}`)
  matched++
}

console.log(`
─────────────────────────────
✓ Matched & updated: ${matched}
✗ No profile found:  ${unmatched}
✗ Errors:            ${errors}
─────────────────────────────
`)

if (unmatched > 0) {
  console.log('Unmatched customers are paying Stripe subscribers with no account on this platform.')
  console.log('Check their emails manually in the Stripe dashboard.\n')
}
