import { NextRequest, NextResponse } from 'next/server'
import { stripe, PRICE_IDS, PremiumRole } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email, full_name, stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const role: PremiumRole = profile.role === 'coach' ? 'coach' : 'player'
  const priceId = PRICE_IDS[role]

  if (!priceId || priceId === 'price_REPLACE_ME') {
    return NextResponse.json({ error: 'Stripe price ID not configured' }, { status: 500 })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  // Reuse existing customer or create a new one
  let customerId = profile.stripe_customer_id as string | undefined

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email ?? user.email,
      name: profile.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id

    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  const premiumPath = role === 'coach' ? '/dashboard/coach/premium' : '/dashboard/player/premium'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/premium/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${premiumPath}`,
    metadata: {
      supabase_user_id: user.id,
      role,
    },
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        role,
      },
    },
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
