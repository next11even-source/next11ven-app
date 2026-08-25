/**
 * POST /api/stripe/sync
 *
 * Looks up the user's email in Stripe, and if they have an active subscription,
 * grants premium and links the customer/subscription. The safety net for a
 * subscription created outside the webhook — in practice a migrated Glide
 * subscriber claiming their account late.
 *
 * Safe to call multiple times — idempotent.
 *
 * ⚠️ Rate of asking Stripe is governed by needsStripeSync() / profiles.stripe_synced_at
 * (lib/stripeSync.ts). The dashboards apply the same rule before fetching, so in
 * the steady state this route isn't invoked at all; the check below is the
 * authoritative one and does not trust the client to have skipped.
 * This used to run on EVERY dashboard load for EVERY non-premium user — its old
 * doc comment claimed "first dashboard load" but nothing enforced that.
 */
import { NextResponse } from 'next/server'
import { onUserUpgradedToPremium } from '@/lib/mailerlite'
import { needsStripeSync } from '@/lib/stripeSync'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

const PLAYER_PRICE_IDS = new Set([
  'next11ven-player-premium-upgrade-membership-29485',
  'next11ven-premium-membership-27980',
])
const COACH_PRICE_IDS = new Set([
  'next11ven-coach-premium-membership-28175',
])

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getRoleFromPriceId(priceId: string): string | null {
  if (PLAYER_PRICE_IDS.has(priceId)) return 'player'
  if (COACH_PRICE_IDS.has(priceId))  return 'coach'
  return null
}

export async function POST() {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = serviceSupabase()

  // Get profile — check if already linked
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, premium, stripe_customer_id, role, stripe_synced_at')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Already linked and premium — nothing to do
  if (profile.premium && profile.stripe_customer_id) {
    return NextResponse.json({ premium: true, synced: false })
  }

  // Asked Stripe about this person recently and it had nothing. Don't ask again.
  if (!needsStripeSync(profile)) {
    return NextResponse.json({ premium: false, synced: false, skipped: true })
  }

  const email = (profile.email ?? user.email ?? '').toLowerCase().trim()
  if (!email) return NextResponse.json({ premium: false, synced: false })

  // Imported here rather than at module scope so the guarded path above doesn't
  // construct a Stripe client it will never use — lib/stripe.ts instantiates on
  // import, and that instantiation was a real slice of this route's CPU.
  const { stripe } = await import('@/lib/stripe')

  // Records that Stripe was asked and came back empty, so the next dashboard load
  // doesn't ask again. Only for the "no subscription" outcomes — a user who IS
  // found comes back premium + linked and exits at the check above instead.
  async function markChecked() {
    await supabase
      .from('profiles')
      .update({ stripe_synced_at: new Date().toISOString() })
      .eq('id', user!.id)
  }

  // Search Stripe for a customer with this email
  const customers = await stripe.customers.list({ email, limit: 5 })
  if (!customers.data.length) {
    await markChecked()
    return NextResponse.json({ premium: false, synced: false })
  }

  // Check each customer for an active subscription
  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 10,
    })

    const activeSub = subs.data[0]
    if (!activeSub) continue

    const priceId = activeSub.items.data[0]?.price?.id ?? null
    const role = priceId ? getRoleFromPriceId(priceId) : null

    // Grant premium and link
    await supabase.from('profiles').update({
      premium: true,
      stripe_customer_id: customer.id,
    }).eq('id', profile.id)

    await supabase.from('subscriptions').upsert({
      user_id: profile.id,
      stripe_subscription_id: activeSub.id,
      stripe_customer_id: customer.id,
      stripe_price_id: priceId,
      role: role ?? profile.role,
      status: activeSub.status,
      cancel_at_period_end: activeSub.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_subscription_id' })

    // Tag in MailerLite — non-blocking
    onUserUpgradedToPremium(email, role ?? profile.role).catch(err =>
      console.error('[MailerLite] onUserUpgradedToPremium error:', err)
    )

    return NextResponse.json({ premium: true, synced: true })
  }

  // Known to Stripe, but no active subscription — still a "nothing to grant"
  // answer, so it gets cached like the others.
  await markChecked()
  return NextResponse.json({ premium: false, synced: false })
}
