import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const FolderRenameSchema = z.object({
  folder_name: z.string().trim().min(1, 'folder_name is required').max(100),
})

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function authSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
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
}

// DELETE /api/coach/shortlist/[player_id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ player_id: string }> }
) {
  const supabase = await authSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { player_id } = await params
  if (!player_id) {
    return NextResponse.json({ error: 'player_id is required' }, { status: 400 })
  }

  const service = serviceSupabase()

  const { data: existing } = await service
    .from('coach_saved_players')
    .select('id')
    .eq('coach_id', user.id)
    .eq('player_id', player_id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await service
    .from('coach_saved_players')
    .delete()
    .eq('coach_id', user.id)
    .eq('player_id', player_id)

  if (error) {
    console.error('[Shortlist DELETE]', error)
    return NextResponse.json({ error: 'Failed to remove player from shortlist' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// PATCH /api/coach/shortlist/[player_id] — update folder_name for one entry
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ player_id: string }> }
) {
  const supabase = await authSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { player_id } = await params
  if (!player_id) {
    return NextResponse.json({ error: 'player_id is required' }, { status: 400 })
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = FolderRenameSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'folder_name is required' }, { status: 400 })
  }
  const { folder_name } = parsed.data

  const service = serviceSupabase()

  const { data: updated, error } = await service
    .from('coach_saved_players')
    .update({ folder_name: folder_name.trim() })
    .eq('coach_id', user.id)
    .eq('player_id', player_id)
    .select()
    .single()

  if (error || !updated) {
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    console.error('[Shortlist PATCH]', error)
    return NextResponse.json({ error: 'Failed to update shortlist entry' }, { status: 500 })
  }

  return NextResponse.json({ entry: updated })
}
