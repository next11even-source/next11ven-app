import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const cookieStore = await cookies()

  // Identify the caller via session
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

  // Verify ownership using anon client (respects RLS for reads)
  const { data: post } = await supabase
    .from('posts')
    .select('author_id')
    .eq('id', id)
    .single()

  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.author_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Use service role to bypass RLS for the write
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await admin
    .from('posts')
    .update({ is_deleted: true })
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Failed to delete post' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
