import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

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

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

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
