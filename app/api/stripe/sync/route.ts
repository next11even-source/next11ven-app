/**
 * POST /api/stripe/sync
 *
 * Called on first dashboard load for each user.
 * Looks up the user's email in Stripe, and if they have an active
 * subscription, grants premium and links the customer/subscription.
 *
 * Safe to call multiple times — idempotent.
 */
import { NextResponse } from 'next/server'
import { onUserUpgradedToPremium } from '@/lib/mailerlite'
import { stripe } from '@/lib/stripe'
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
    .select('id, email, premium, stripe_customer_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Already linked and premium — nothing to do
  if (profile.premium && profile.stripe_customer_id) {
    return NextResponse.json({ premium: true, synced: false })
  }

  const email = (profile.email ?? user.email ?? '').toLowerCase().trim()
  if (!email) return NextResponse.json({ premium: false, synced: false })

  // Search Stripe for a customer with this email
  const customers = await stripe.customers.list({ email, limit: 5 })
  if (!customers.data.length) {
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

  return NextResponse.json({ premium: false, synced: false })
}
