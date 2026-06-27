import { NextRequest, NextResponse } from 'next/server'
import { stripe, MESSAGE_PACK_PRICE_ID } from '@/lib/stripe'
import { MESSAGE_PACK_CREDITS } from '@/lib/message-pack'
import { createServerSupabase } from '@/lib/supabase-server'
import { enforceRateLimit } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limited = await enforceRateLimit('stripeCheckout', user.id)
  if (limited) return limited

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email, full_name, stripe_customer_id, premium')
    .eq('id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const isPlayer = profile.role === 'player' || profile.role === 'admin'
  if (!isPlayer || !profile.premium) {
    return NextResponse.json({ error: 'Premium players only' }, { status: 403 })
  }

  if (!MESSAGE_PACK_PRICE_ID || MESSAGE_PACK_PRICE_ID === 'price_REPLACE_ME') {
    return NextResponse.json({ error: 'Message pack not configured' }, { status: 500 })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

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

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{ price: MESSAGE_PACK_PRICE_ID, quantity: 1 }],
    success_url: `${origin}/dashboard/player/extra-messages?purchased=true`,
    cancel_url: `${origin}/dashboard/player/extra-messages`,
    metadata: {
      supabase_user_id: user.id,
      type: 'message_pack',
      credits: String(MESSAGE_PACK_CREDITS),
    },
    allow_promotion_codes: true,
  })

  return NextResponse.json({ url: session.url })
}
