import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { stripe } from '@/lib/stripe'

// £14.99 = 1499p, £20 = 2000p
const SHOWCASE_AMOUNTS = [1499, 2000]

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return me?.role === 'admin' ? user : null
}

// ── GET: fetch all showcase payers from Stripe + match to profiles ─────────

export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Pull all paid checkout sessions from Stripe (paginated)
  const paidSessions: { email: string; name: string | null; amount: number }[] = []
  let startingAfter: string | undefined
  let hasMore = true

  while (hasMore) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })

    for (const session of page.data) {
      if (session.payment_status !== 'paid') continue
      if (!SHOWCASE_AMOUNTS.includes(session.amount_total ?? 0)) continue
      const email = session.customer_details?.email
      if (!email) continue
      paidSessions.push({
        email: email.toLowerCase(),
        name: session.customer_details?.name ?? null,
        amount: session.amount_total ?? 0,
      })
    }

    hasMore = page.has_more
    if (hasMore && page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id
    } else {
      hasMore = false
    }
  }

  if (paidSessions.length === 0) {
    return NextResponse.json({ matched: [], unmatched: [], already_enabled: [] })
  }

  // Deduplicate by email
  const uniqueEmails = [...new Set(paidSessions.map(s => s.email))]

  const supabase = serviceSupabase()

  // First pass: match by email
  const { data: emailProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, position, club, role, avatar_url, showcase_attended')
    .in('email', uniqueEmails)

  const profilesByEmail = new Map((emailProfiles ?? []).map(p => [p.email?.toLowerCase(), p]))

  type Profile = NonNullable<typeof emailProfiles>[number]
  const matched: Profile[] = []
  const already_enabled: Profile[] = []
  const needsNameLookup: { email: string; name: string | null; amount: number }[] = []

  for (const session of paidSessions) {
    const profile = profilesByEmail.get(session.email)
    if (!profile) {
      needsNameLookup.push(session)
    } else if (profile.showcase_attended) {
      already_enabled.push(profile)
    } else {
      matched.push(profile)
    }
  }

  // Second pass: for sessions with no email match, try matching by full name
  const unmatched: { email: string; name: string | null; amount: number }[] = []
  const alreadyMatchedIds = new Set([...matched, ...already_enabled].map(p => p.id))

  for (const session of needsNameLookup) {
    if (!session.name) { unmatched.push(session); continue }

    const { data: nameProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, email, position, club, role, avatar_url, showcase_attended')
      .ilike('full_name', session.name.trim())
      .limit(1)

    const profile = nameProfiles?.[0]

    if (!profile || alreadyMatchedIds.has(profile.id)) {
      unmatched.push(session)
    } else if (profile.showcase_attended) {
      already_enabled.push(profile)
      alreadyMatchedIds.add(profile.id)
    } else {
      matched.push(profile)
      alreadyMatchedIds.add(profile.id)
    }
  }

  return NextResponse.json({ matched, unmatched, already_enabled })
}

// ── POST: enable showcase_attended for given profile IDs ───────────────────

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { ids } = await req.json() as { ids: string[] }
  if (!ids?.length) return NextResponse.json({ error: 'No ids provided' }, { status: 400 })

  const supabase = serviceSupabase()
  const { error } = await supabase
    .from('profiles')
    .update({ showcase_attended: true })
    .in('id', ids)

  if (error) {
    console.error('[showcase-payers] enable error:', error)
    return NextResponse.json({ error: 'Failed to update profiles' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: ids.length })
}
