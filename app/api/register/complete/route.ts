import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { normalizePhone } from '@/lib/utils'
import { enforceRateLimit } from '@/lib/ratelimit'

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

  // Verify the caller is authenticated — their session was just created by signUp
  const { data: { user } } = await supabase.auth.getUser()

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const userId = user?.id ?? (body.userId as string | undefined)
  if (!userId) {
    return NextResponse.json({ error: 'No authenticated user' }, { status: 401 })
  }

  const limited = await enforceRateLimit('registerComplete', userId)
  if (limited) return limited

  const VALID_LEVELS = ['Step 1', 'Step 2', 'Step 3', 'Step 4', 'Step 5', 'Step 6', 'Step 7', 'U18s/Academy', 'Wales 1', 'Wales 2', 'Other']

  // Only allow writing safe profile fields — never let the client set role to admin
  const allowedRoles = ['player', 'coach', 'fan']
  const role = body.role as string | undefined
  if (role && !allowedRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const profilePayload: Record<string, unknown> = {
    id: userId,
    full_name: body.full_name ?? null,
    email: body.email ?? null,
    phone: normalizePhone(body.phone as string | null) ?? null,
    sms_opt_in: !!body.phone,
    date_of_birth: body.date_of_birth ?? null,
    role: role ?? null,
    city: body.city ?? null,
    location: body.location ?? null,
    referral: body.referral ?? null,
    gdpr_consent: body.gdpr_consent ?? false,
    approved: false,
    approval_status: 'pending',
  }

  if (role === 'player') {
    const pl = body.playing_level as string | undefined
    if (pl && !VALID_LEVELS.includes(pl)) {
      return NextResponse.json({ error: 'Invalid playing level' }, { status: 400 })
    }
    profilePayload.playing_level = pl ?? null
    profilePayload.club = body.club ?? null
    profilePayload.position = body.position ?? null
    profilePayload.secondary_position = body.secondary_position ?? null
    profilePayload.foot = body.foot ?? null
    profilePayload.status = body.status ?? 'just_exploring'
    profilePayload.highlight_urls = body.highlight_urls ?? []
    profilePayload.height = body.height ?? null
  } else if (role === 'coach') {
    profilePayload.coaching_role = body.coaching_role ?? null
    const cl = body.coaching_level as string | undefined
    if (cl && !VALID_LEVELS.includes(cl)) {
      return NextResponse.json({ error: 'Invalid coaching level' }, { status: 400 })
    }
    profilePayload.coaching_level = cl ?? null
    profilePayload.club = body.club ?? null
    profilePayload.coaching_history = body.coaching_history ?? null
    // coaches must have a valid status to satisfy profiles_status_check
    profilePayload.status = 'just_exploring'
  } else if (role === 'fan') {
    profilePayload.status = 'just_exploring'
  }

  // Use service role to bypass RLS — safe because we verified userId from the session
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Stamp role into auth user_metadata before the upsert so the DB trigger
  // (which reads raw_user_meta_data) creates/updates the row with the correct role,
  // not null or 'player'. This mirrors the fix learned in rescue-profile.
  try {
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        full_name: body.full_name,
        role,
      },
    })
  } catch (metaErr) {
    // Non-fatal — continue with upsert regardless
    console.warn('[Register] could not stamp role into auth metadata:', metaErr)
  }

  const { error } = await admin
    .from('profiles')
    .upsert(profilePayload)

  if (error) {
    console.error('[Register] profile upsert error:', error)
    return NextResponse.json({ error: 'Profile update failed: ' + error.message }, { status: 500 })
  }

  // Belt-and-suspenders: the DB trigger on profiles INSERT can reset role to null
  // or 'player'. Explicit UPDATE after the upsert guarantees the role sticks.
  const { error: updateError } = await admin
    .from('profiles')
    .update({ role, status: profilePayload.status as string })
    .eq('id', userId)

  if (updateError) {
    console.error('[Register] explicit role UPDATE failed:', updateError)
    // Don't block registration — the upsert succeeded, this is just hardening
  }

  // Fire-and-forget — never block or fail registration
  if (process.env.MAKE_SIGNUP_WEBHOOK_URL) {
    const club = (body.club as string | undefined) || null
    const city = (body.city as string | undefined) || null
    const parts = [role, club, city].filter(Boolean).join(' · ')
    fetch(process.env.MAKE_SIGNUP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'signup',
        name: body.full_name ?? 'Unknown',
        email: body.email ?? null,
        role: role ?? null,
        club,
        city,
        summary: parts,
      }),
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
