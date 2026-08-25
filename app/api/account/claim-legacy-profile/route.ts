/**
 * POST /api/account/claim-legacy-profile
 *
 * The Glide-migration fallback from /set-password: a user's profile exists under
 * their OLD Glide id but the same email, so after claiming their account the
 * lookup by auth id misses. This re-points that row's id at the new auth user so
 * every future login works normally, and auto-approves fans (browse-only, nothing
 * to review).
 *
 * WHY IT MOVED OFF THE CLIENT (25 Aug 2026): the page did this itself with
 * `.select(...).eq('email', user.email).neq('id', user.id)` followed by
 * `.update(...).eq('email', user.email)` — a cross-row READ and a cross-row WRITE.
 * Both are blocked once 20260825000006 narrows profiles to the caller's own row,
 * and the read couldn't move to public_profiles either (no email or
 * approval_status there, by design). It is inherently privileged, so it belongs
 * behind the service role.
 *
 * SAFE because the email is never supplied by the caller — it is taken from the
 * verified session. A user can only ever claim a legacy row matching the address
 * they just authenticated with, which is exactly the row that is already theirs.
 *
 * ⚠️ Do not delete along with the rest of the claim flow — CLAUDE.md notes some
 * migrated users may still need /claim and /set-password.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  const supabaseUser = await createServerSupabase()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Only ever the caller's own verified address, never a client-supplied one.
  const { data: byEmail } = await supabase
    .from('profiles')
    .select('role, approved, approval_status')
    .eq('email', user.email)
    .neq('id', user.id)
    .single()

  if (!byEmail) return NextResponse.json({ profile: null })

  const shouldAutoApprove = byEmail.role === 'fan'
  const updates: Record<string, unknown> = { id: user.id }
  if (shouldAutoApprove) {
    updates.approved = true
    updates.approval_status = 'approved'
  }

  const { error } = await supabase.from('profiles').update(updates).eq('email', user.email)
  if (error) return NextResponse.json({ error: 'Claim failed' }, { status: 500 })

  return NextResponse.json({
    profile: {
      ...byEmail,
      ...(shouldAutoApprove ? { approved: true, approval_status: 'approved' } : {}),
    },
  })
}
