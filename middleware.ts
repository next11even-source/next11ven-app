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

      // Honor a post-login destination (e.g. email deep links) — internal paths only.
      // Role isolation below still applies when the destination is loaded.
      const next = request.nextUrl.searchParams.get('next')
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        return NextResponse.redirect(new URL(next, request.url))
      }

      const dest = profile.role === 'coach' ? '/dashboard/coach' : '/dashboard/player'
      return NextResponse.redirect(new URL(dest, request.url))
    }

    return supabaseResponse
  }

  // Unauthenticated users can't access anything else — remember where they
  // were headed so sign-in can return them there (email deep links).
  if (!user) {
    const signIn = new URL('/', request.url)
    if (pathname.startsWith('/dashboard')) {
      signIn.searchParams.set('next', pathname + request.nextUrl.search)
    }
    return NextResponse.redirect(signIn)
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

// ⚠️ Middleware runs BEFORE the CDN cache, so it is the only server-side work
// most of this app does. Nearly every /dashboard page builds as ○ (Static) —
// they're 'use client' and fetch their own data from the browser — so the page
// itself costs no compute, and this file is the entire per-request bill: a 288KB
// bundle (@supabase/ssr + supabase-js), an auth.getUser() round-trip, and a
// profiles lookup. Measured 25 Aug 2026 at 2h48m of a 4h monthly Vercel Fluid
// Active CPU allowance — 69% of the whole platform's CPU.
//
// The multiplier was <Link> prefetch. There are 135 links and no loading.tsx
// boundaries, so every card that scrolls into view on a browse list fires a
// prefetch. The payload comes off the CDN for free but used to run all of the
// above. The `missing` clauses below skip those requests entirely — Vercel never
// invokes the function, so it isn't just cheaper, it isn't billed at all.
//
// WHY THAT IS SAFE HERE, and the condition under which it stops being safe:
// a skipped prefetch means the RSC payload is served with no auth check, and for
// a static route Next reuses that payload for a client-side navigation within
// its 5-minute staleTime — so the redirects below genuinely do not run on those
// navigations. That costs nothing today because NO server component under
// /dashboard fetches anything: app/layout.tsx and app/dashboard/layout.tsx hold
// no data, and the only non-'use client' pages in the app are /privacy, /terms
// (not matched here) and four redirect shims. The prefetched payload is an empty
// shell; all real data arrives client-side under Supabase RLS, and the API routes
// authorise independently. This middleware is UX routing, not the data boundary.
// ⚠️ If a server component under /dashboard ever starts reading user data, that
// stops being true — drop the `missing` clause for that route before it ships.
//
// Only /dashboard is treated this way. The rest are low-volume and their
// redirects are load-bearing for UX: prefetching '/' past this check would let a
// signed-in user land on the sign-in page instead of their dashboard.
// ⚠️ Next parses this export statically at build time — every value has to be an
// inline literal. Hoisting the `missing` array to a named const fails the build
// with "Unknown identifier at config.matcher[n].missing".
export const config = {
  matcher: [
    '/',
    '/claim',
    '/register',
    '/set-password',
    '/pending',
    '/auth/callback',
    '/auth/confirm',
    '/premium/:path*',
    // '/dashboard/player/:path*' used to be listed alongside this and was dead
    // weight — it is a strict subset of '/dashboard/:path*'.
    {
      source: '/dashboard/:path*',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
