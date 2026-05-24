import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { stripe } from '@/lib/stripe'

const SHOWCASE_PAYMENT_LINK_URL = 'https://buy.stripe.com/eVqdRaaMc9iu6jb3fp2Ry01'
const SHOWCASE_TOTAL_SPOTS = 28

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = serviceSupabase()
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Find the showcase payment link in Stripe
  let paymentLinkId: string | null = null
  try {
    const links = await stripe.paymentLinks.list({ limit: 100 })
    const match = links.data.find(pl => pl.url === SHOWCASE_PAYMENT_LINK_URL)
    paymentLinkId = match?.id ?? null
  } catch (err) {
    console.error('[showcase-stats] error listing payment links:', err)
  }

  if (!paymentLinkId) {
    return NextResponse.json({
      total: 0,
      spots_remaining: SHOWCASE_TOTAL_SPOTS,
      total_spots: SHOWCASE_TOTAL_SPOTS,
      by_position: {},
      purchasers: [],
      error: 'Payment link not found in Stripe',
    })
  }

  // Fetch all completed sessions for this payment link (paginate if needed)
  const sessions: {
    customer_email: string | null
    customer_details: { email?: string | null; name?: string | null } | null
    amount_total: number | null
    created: number
  }[] = []

  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    const page = await stripe.checkout.sessions.list({
      payment_link: paymentLinkId,
      limit: 100,
      status: 'complete',
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const s of page.data) {
      sessions.push({
        customer_email: s.customer_email,
        customer_details: s.customer_details,
        amount_total: s.amount_total,
        created: s.created,
      })
    }

    hasMore = page.has_more
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id
    } else {
      hasMore = false
    }
  }

  // Collect emails to cross-reference with profiles for position data
  const emails = sessions
    .map(s => s.customer_details?.email ?? s.customer_email)
    .filter((e): e is string => !!e)
    .map(e => e.toLowerCase())

  const uniqueEmails = [...new Set(emails)]

  const { data: profiles } = uniqueEmails.length > 0
    ? await supabase
        .from('profiles')
        .select('email, full_name, position, club')
        .in('email', uniqueEmails)
    : { data: [] }

  const profileByEmail = new Map(
    (profiles ?? []).map(p => [p.email?.toLowerCase(), p])
  )

  // Build purchaser list and position breakdown
  const by_position: Record<string, number> = {}
  const purchasers: {
    email: string | null
    name: string | null
    position: string | null
    club: string | null
    purchased_at: string
    amount: number | null
  }[] = []

  for (const s of sessions) {
    const email = (s.customer_details?.email ?? s.customer_email ?? '').toLowerCase() || null
    const profile = email ? profileByEmail.get(email) : null
    const position = profile?.position ?? null
    const name = profile?.full_name ?? s.customer_details?.name ?? null
    const club = profile?.club ?? null

    if (position) {
      by_position[position] = (by_position[position] ?? 0) + 1
    } else {
      by_position['Unknown'] = (by_position['Unknown'] ?? 0) + 1
    }

    purchasers.push({
      email,
      name,
      position,
      club,
      purchased_at: new Date(s.created * 1000).toISOString(),
      amount: s.amount_total,
    })
  }

  purchasers.sort((a, b) => new Date(b.purchased_at).getTime() - new Date(a.purchased_at).getTime())

  return NextResponse.json({
    total: sessions.length,
    spots_remaining: Math.max(0, SHOWCASE_TOTAL_SPOTS - sessions.length),
    total_spots: SHOWCASE_TOTAL_SPOTS,
    by_position,
    purchasers,
  })
}
