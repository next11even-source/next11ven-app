import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase-server'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'

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

  const [dbResult, stripeSubs] = await Promise.all([
    supabase.rpc('analytics_revenue_stats'),
    fetchAllActiveSubs(),
  ])

  if (dbResult.error) {
    console.error('[revenue-stats]', dbResult.error)
    return NextResponse.json({ error: 'Failed to fetch revenue stats' }, { status: 500 })
  }

  // Use latest_invoice.amount_paid as the true per-subscription MRR contribution.
  // This reflects any discounts (including 100% off codes) as the actual charged amount.
  let realMrrPence = 0
  let freeSubs = 0
  for (const sub of stripeSubs) {
    const invoice = sub.latest_invoice
    const paid = invoice && typeof invoice !== 'string' ? (invoice.amount_paid ?? 0) : 0
    realMrrPence += paid
    if (paid === 0) freeSubs++
  }

  return NextResponse.json({
    ...dbResult.data,
    mrr_pence: realMrrPence,
    free_sub_count: freeSubs,
  })
}

async function fetchAllActiveSubs(): Promise<Stripe.Subscription[]> {
  const result: Stripe.Subscription[] = []
  let startingAfter: string | undefined
  while (true) {
    const page = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.latest_invoice'],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })
    result.push(...page.data)
    if (!page.has_more || page.data.length === 0) break
    startingAfter = page.data[page.data.length - 1].id
  }
  return result
}
