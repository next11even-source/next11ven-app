import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Layer 3 conversion intelligence: logs every paywall SHOWN (not just clicked)
// to a free user, so an upgrade can later be attributed to the action that
// preceded it. premium_clicks already existed in the schema for exactly this
// but nothing wrote to it — see the analytics rebuild investigation.
const TrackSchema = z.object({
  touchpoint: z.enum(['actively_looking_toggle', 'apply_gate', 'match_paywall', 'message_read_paywall']),
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let rawBody: unknown
  try { rawBody = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const parsed = TrackSchema.safeParse(rawBody)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid touchpoint' }, { status: 400 })

  // Service-role client: this is a fire-and-forget analytics write, not a
  // user-owned row — no RLS policy exists on premium_clicks for client inserts.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin.from('premium_clicks').insert({
    user_id: user.id,
    touchpoint: parsed.data.touchpoint,
    clicked_at: new Date().toISOString(),
    converted: false,
  })

  // Best-effort: a tracking failure must never surface to the user or block
  // the paywall they're looking at.
  if (error) console.error('[track/premium-intent] insert error:', error)

  return NextResponse.json({ success: true })
}
