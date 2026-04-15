/**
 * POST /api/admin/stripe-reconcile
 *
 * Admin-only. Pulls all active subscriptions from Stripe and reconciles
 * against Supabase profiles. Any profile marked premium=true with no active
 * Stripe subscription gets revoked. Any active subscription that hasn't
 * flipped premium=true gets granted.
 */
import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST() {
  // Admin check
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = serviceSupabase()
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 1. Fetch all active Stripe subscriptions (paginate through all)
  const activeCustomerIds = new Set<string>()
  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    const page = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const sub of page.data) {
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
      activeCustomerIds.add(customerId)
    }

    hasMore = page.has_more
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id
    }
  }

  // Also check trialing subscriptions
  const trialingPage = await stripe.subscriptions.list({ status: 'trialing', limit: 100 })
  for (const sub of trialingPage.data) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    activeCustomerIds.add(customerId)
  }

  // 2. Get all profiles that have a stripe_customer_id set
  const { data: linkedProfiles } = await supabase
    .from('profiles')
    .select('id, premium, stripe_customer_id')
    .not('stripe_customer_id', 'is', null)

  let granted = 0
  let revoked = 0

  for (const profile of linkedProfiles ?? []) {
    const shouldBePremium = activeCustomerIds.has(profile.stripe_customer_id)

    if (shouldBePremium && !profile.premium) {
      await supabase.from('profiles').update({ premium: true }).eq('id', profile.id)
      granted++
    } else if (!shouldBePremium && profile.premium) {
      await supabase.from('profiles').update({ premium: false }).eq('id', profile.id)
      revoked++
    }
  }

  console.log(`[stripe-reconcile] granted=${granted} revoked=${revoked} checked=${linkedProfiles?.length ?? 0}`)

  return NextResponse.json({
    ok: true,
    checked: linkedProfiles?.length ?? 0,
    granted,
    revoked,
  })
}
