import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { normalizePhone } from '@/lib/utils'
import { validateDob } from '@/lib/dob'
import { enforceRateLimit } from '@/lib/ratelimit'
import { onUserApproved } from '@/lib/mailerlite'
import { isValidCity } from '@/lib/cities'
import { z } from 'zod'

// Fan → Player / Coach conversion.
// A fan is already an approved human; converting keeps approved=true and drops
// them straight into full access (instant, no re-approval). We only flip the
// role once they've supplied a real profile — the required-field gate below is
// server-enforced so the UI can't wave through a half-empty conversion.

const VALID_LEVELS = ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7', 'U18s/Academy', 'Wales 1', 'Wales 2', 'Other']

const ConvertSchema = z.object({
  role: z.enum(['player', 'coach']),
  full_name: z.string().max(200).nullish(),
  phone: z.string().max(40).nullish(),
  date_of_birth: z.string().nullish(),
  city: z.string().max(160).nullish(),
  // player
  playing_level: z.string().nullish(),
  club: z.string().max(200).nullish(),
  position: z.string().max(80).nullish(),
  secondary_position: z.string().max(80).nullish(),
  foot: z.string().max(20).nullish(),
  status: z.string().max(40).nullish(),
  height: z.string().max(20).nullish(),
  highlight_urls: z.array(z.string()).nullish(),
  // coach
  coaching_role: z.string().max(160).nullish(),
  coaching_level: z.string().nullish(),
  coaching_history: z.string().max(5000).nullish(),
})

// Core-fields gate — enough to be a real, findable profile. Not the full set.
function missingFields(role: 'player' | 'coach', b: z.infer<typeof ConvertSchema>): string[] {
  const missing: string[] = []
  const need = (label: string, value: unknown) => {
    if (!value || (typeof value === 'string' && !value.trim())) missing.push(label)
  }
  need('Full name', b.full_name)
  // Mobile number required for both roles, kept in step with /api/register/complete
  // — otherwise a player or coach could sign up as a fan and convert to dodge it.
  need('Mobile number', b.phone)
  if (role === 'player') {
    need('Date of birth', b.date_of_birth)
    need('Nearest city', b.city)
    need('Playing level', b.playing_level)
    need('Best position', b.position)
    need('Current club (or status)', b.club)
  } else {
    need('Nearest city', b.city)
    need('Coaching role', b.coaching_role)
    need('Coaching level', b.coaching_level)
    need('Current club', b.club)
  }
  return missing
}

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
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const limited = await enforceRateLimit('accountConvert', user.id)
  if (limited) return limited

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = ConvertSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, { status: 400 })
  }
  const body = parsed.data
  const role = body.role

  // Only fans may convert — never let this route change a player↔coach or touch admin.
  const { data: current } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single()

  if (!current) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (current.role !== 'fan') {
    return NextResponse.json({ error: 'Only supporter accounts can be converted' }, { status: 403 })
  }

  // Enough-information gate
  const missing = missingFields(role, body)
  if (missing.length) {
    return NextResponse.json(
      { error: 'INCOMPLETE', message: `Please complete: ${missing.join(', ')}`, missing },
      { status: 400 }
    )
  }

  // Age floor + typo guard — kept in step with /api/register/complete.
  const dobProblem = validateDob(body.date_of_birth)
  if (dobProblem) {
    return NextResponse.json({ error: 'INVALID_DOB', message: dobProblem }, { status: 400 })
  }

  // Level validation
  if (role === 'player' && body.playing_level && !VALID_LEVELS.includes(body.playing_level)) {
    return NextResponse.json({ error: 'Invalid playing level' }, { status: 400 })
  }
  if (role === 'coach' && body.coaching_level && !VALID_LEVELS.includes(body.coaching_level)) {
    return NextResponse.json({ error: 'Invalid coaching level' }, { status: 400 })
  }
  if (body.city && !isValidCity(body.city)) {
    return NextResponse.json({ error: 'Please select a city from the list' }, { status: 400 })
  }

  const payload: Record<string, unknown> = {
    role,
    full_name: body.full_name ?? null,
    city: body.city ?? null,
    // approved stays true — a fan was already vetted; conversion is instant.
    approved: true,
    approval_status: 'approved',
  }
  if (body.phone?.trim()) {
    const phone = normalizePhone(body.phone)
    if (!phone) {
      return NextResponse.json({ error: 'Enter a valid UK mobile number, e.g. 07700 900000' }, { status: 400 })
    }
    payload.phone = phone
    payload.sms_opt_in = true
  }

  if (role === 'player') {
    payload.date_of_birth = body.date_of_birth ?? null
    payload.playing_level = body.playing_level ?? null
    payload.club = body.club ?? null
    payload.position = body.position ?? null
    payload.secondary_position = body.secondary_position ?? null
    payload.foot = body.foot ?? null
    payload.height = body.height ?? null
    payload.status = body.status ?? 'just_exploring'
    payload.highlight_urls = body.highlight_urls ?? []
  } else {
    payload.coaching_role = body.coaching_role ?? null
    payload.coaching_level = body.coaching_level ?? null
    payload.club = body.club ?? null
    payload.coaching_history = body.coaching_history ?? null
    payload.status = 'just_exploring'
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Mirror the new role into auth metadata so the profiles trigger (which reads
  // raw_user_meta_data) doesn't clobber it back to 'fan' — same gotcha the
  // register-complete route handles.
  try {
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { full_name: body.full_name, role },
    })
  } catch (metaErr) {
    console.warn('[Convert] could not stamp role into auth metadata:', metaErr)
  }

  const { error } = await admin.from('profiles').update(payload).eq('id', user.id)
  if (error) {
    console.error('[Convert] profile update error:', error)
    return NextResponse.json({ error: 'Conversion failed: ' + error.message }, { status: 500 })
  }

  const email = current.email as string | null

  // Add to the right MailerLite lifecycle group (fires onboarding sequence for
  // new subscribers; no-op update for existing ones). Fire-and-forget.
  if (email) {
    onUserApproved(email, body.full_name ?? null, role, body.city ?? null).catch(() => {})
  }

  // Notify founder of the conversion so it can be spot-checked. Fire-and-forget.
  if (process.env.MAKE_SIGNUP_WEBHOOK_URL) {
    const parts = [`fan→${role}`, body.club, body.city].filter(Boolean).join(' · ')
    fetch(process.env.MAKE_SIGNUP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'conversion',
        name: body.full_name ?? 'Unknown',
        email,
        role,
        club: body.club ?? null,
        city: body.city ?? null,
        summary: parts,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, role })
}
