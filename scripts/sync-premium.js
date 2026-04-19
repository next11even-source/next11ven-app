/**
 * sync-premium.js
 * Bulk-grants premium to all Supabase profiles that have an active Stripe subscription.
 * Matches by email. Safe to re-run.
 *
 * Run: node scripts/sync-premium.js
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const Stripe = require('stripe')

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  console.log('\n========== BULK PREMIUM SYNC ==========\n')

  // 1. Fetch all active subscriptions from Stripe
  console.log('Fetching active subscriptions from Stripe...')
  const activeSubs = []
  let startingAfter = undefined
  while (true) {
    const page = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.customer'],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    activeSubs.push(...page.data)
    if (!page.has_more) break
    startingAfter = page.data[page.data.length - 1].id
  }
  console.log(`Found ${activeSubs.length} active subscriptions in Stripe\n`)

  if (activeSubs.length === 0) {
    console.log('No active subscriptions found — nothing to do.')
    return
  }

  // 2. Build email → { customerId, subscriptionId, priceId } map
  const stripeMap = {}
  for (const sub of activeSubs) {
    const customer = sub.customer
    const email = (typeof customer === 'object' ? customer.email : null)?.toLowerCase().trim()
    const customerId = typeof customer === 'object' ? customer.id : customer
    const priceId = sub.items.data[0]?.price?.id ?? null
    if (email) {
      stripeMap[email] = { customerId, subscriptionId: sub.id, priceId, status: sub.status }
    }
  }
  console.log(`Mapped ${Object.keys(stripeMap).length} unique emails from Stripe\n`)

  // 3. Fetch all profiles from Supabase
  console.log('Fetching all profiles from Supabase...')
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, role, premium, stripe_customer_id')
  if (error) { console.error('Failed to fetch profiles:', error.message); process.exit(1) }
  console.log(`Found ${profiles.length} profiles\n`)

  let granted = 0
  let alreadyPremium = 0
  let noMatch = 0

  for (const profile of profiles) {
    const email = (profile.email || '').toLowerCase().trim()
    const stripeData = stripeMap[email]

    if (!stripeData) {
      noMatch++
      continue
    }

    if (profile.premium && profile.stripe_customer_id) {
      console.log(`SKIP (already premium) — ${email}`)
      alreadyPremium++
      continue
    }

    // Grant premium
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ premium: true, stripe_customer_id: stripeData.customerId })
      .eq('id', profile.id)

    if (updateErr) {
      console.error(`FAIL — ${email}: ${updateErr.message}`)
      continue
    }

    // Upsert subscription record
    await supabase.from('subscriptions').upsert({
      user_id: profile.id,
      stripe_subscription_id: stripeData.subscriptionId,
      stripe_customer_id: stripeData.customerId,
      stripe_price_id: stripeData.priceId,
      role: profile.role,
      status: stripeData.status,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_subscription_id' })

    console.log(`GRANTED — ${email} (${profile.role})`)
    granted++
  }

  console.log('\n========== SYNC COMPLETE ==========')
  console.log(`  Granted premium  : ${granted}`)
  console.log(`  Already premium  : ${alreadyPremium}`)
  console.log(`  No Stripe match  : ${noMatch}`)
  console.log('====================================\n')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
