import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Admin-only moderation edit — lets the founder correct or scrub a coach's
// opportunity content (e.g. rewriting "apply via email/DM" instructions to
// point back to NEXT11VEN, or removing third-party promo mentions) without
// waiting on the posting coach. Every field is optional so the client can
// send a partial patch.
const OpportunityEditSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200).optional(),
  club: z.string().max(200).nullish(),
  location: z.string().max(200).nullish(),
  position: z.string().max(120).nullish(),
  level: z.string().max(120).nullish(),
  description: z.string().max(5000).nullish(),
  urgent: z.boolean().nullish(),
  deadline: z.string().nullish(),
})

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: caller } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (caller?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = OpportunityEditSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, { status: 400 })
  }

  const service = serviceSupabase()

  const { data: updated, error } = await service
    .from('opportunities')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error || !updated) {
    if (!updated) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 })
    console.error('[Admin] opportunity edit error:', error)
    return NextResponse.json({ error: 'Failed to update opportunity' }, { status: 500 })
  }

  return NextResponse.json({ opportunity: updated })
}
