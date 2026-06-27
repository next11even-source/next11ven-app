import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const OpportunitySchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200),
  club: z.string().max(200).nullish(),
  location: z.string().max(200).nullish(),
  position: z.string().max(120).nullish(),
  level: z.string().max(120).nullish(),
  description: z.string().max(5000).nullish(),
  urgent: z.boolean().nullish(),
  deadline: z.string().nullish(),
  opportunity_type: z.enum(['player', 'coach']).optional(),
})

export async function POST(req: NextRequest) {
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

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = OpportunitySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, { status: 400 })
  }
  const body = parsed.data

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await admin
    .from('opportunities')
    .insert({
      coach_id: user.id,
      title: body.title,
      club: body.club ?? null,
      location: body.location ?? null,
      position: body.position ?? null,
      level: body.level ?? null,
      description: body.description ?? null,
      urgent: body.urgent ?? false,
      deadline: body.deadline ?? null,
      opportunity_type: body.opportunity_type ?? 'player',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget — never block opportunity creation
  if (process.env.MAKE_SIGNUP_WEBHOOK_URL) {
    const parts = [body.position, body.level, body.location].filter(Boolean).join(' · ')
    fetch(process.env.MAKE_SIGNUP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'opportunity',
        title: body.title,
        club: body.club ?? null,
        position: body.position ?? null,
        level: body.level ?? null,
        location: body.location ?? null,
        opportunity_type: body.opportunity_type ?? 'player',
        summary: parts,
      }),
    }).catch(() => {})
  }

  return NextResponse.json(data)
}
