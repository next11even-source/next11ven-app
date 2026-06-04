import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

async function getCallerWithRole(cookieStore: Awaited<ReturnType<typeof cookies>>) {
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
  if (!user) return { supabase, user: null, role: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return { supabase, user, role: profile?.role ?? null }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cookieStore = await cookies()
  const { user, role } = await getCallerWithRole(cookieStore)

  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const caption = typeof body.caption === 'string' ? body.caption.trim().slice(0, 1000) : null

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await adminClient
    .from('posts')
    .update({ caption })
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Failed to update post' }, { status: 500 })

  return NextResponse.json({ ok: true, caption })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cookieStore = await cookies()
  const { supabase, user, role } = await getCallerWithRole(cookieStore)

  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: post } = await supabase
    .from('posts')
    .select('author_id')
    .eq('id', id)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.author_id !== user.id && role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await adminClient
    .from('posts')
    .update({ is_deleted: true })
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
