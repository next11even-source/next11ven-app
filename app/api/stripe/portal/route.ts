import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServerSupabase } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const returnUrl = profile.role === 'coach'
    ? `${origin}/dashboard/coach`
    : `${origin}/dashboard/player/premium`

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: returnUrl,
  })

  return NextResponse.json({ url: session.url })
}
