import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that are always publicly accessible
const PUBLIC_ROUTES = ['/', '/claim', '/auth/callback', '/auth/confirm', '/register', '/premium/success']

// Routes that require auth but skip the approved/role checks
// (user is mid-onboarding — authenticated via magic link, setting password)
const ONBOARDING_ROUTES = ['/set-password']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Always allow public routes through
  if (PUBLIC_ROUTES.includes(pathname)) {
    // Redirect signed-in users away from sign-in and claim pages
    if (user && (pathname === '/' || pathname === '/claim')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('approved, role')
        .eq('id', user.id)
        .single()

      if (!profile?.approved) {
        return NextResponse.redirect(new URL('/pending', request.url))
      }

      const dest = profile.role === 'coach' ? '/dashboard/coach' : '/dashboard/player'
      return NextResponse.redirect(new URL(dest, request.url))
    }

    return supabaseResponse
  }

  // Unauthenticated users can't access anything else
  if (!user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Onboarding routes: must be authenticated, but skip approval/role redirect
  if (ONBOARDING_ROUTES.includes(pathname)) {
    return supabaseResponse
  }

  // /pending — if already approved, push to correct dashboard
  if (pathname === '/pending') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('approved, role')
      .eq('id', user.id)
      .single()

    if (profile?.approved) {
      // coach → coach dashboard, everyone else (player, fan, admin) → player dashboard
      const dest = profile.role === 'coach' ? '/dashboard/coach' : '/dashboard/player'
      return NextResponse.redirect(new URL(dest, request.url))
    }

    return supabaseResponse
  }

  // /dashboard/* — must be approved (admin always let through)
  if (pathname.startsWith('/dashboard')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('approved, role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'admin') return supabaseResponse

    if (!profile?.approved) {
      return NextResponse.redirect(new URL('/pending', request.url))
    }

    // Role isolation: coaches must stay on /dashboard/coach/*
    // Exception: /dashboard/player/players/[id] — coaches can view individual player profiles
    if (profile?.role === 'coach' && pathname.startsWith('/dashboard/player')) {
      const isIndividualProfile = /^\/dashboard\/player\/players\/[^/]+$/.test(pathname)
      if (!isIndividualProfile) {
        return NextResponse.redirect(new URL('/dashboard/coach', request.url))
      }
    }

    return supabaseResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/', '/claim', '/register', '/set-password', '/pending', '/auth/callback', '/auth/confirm', '/premium/:path*', '/dashboard/:path*', '/dashboard/player/:path*'],
}
