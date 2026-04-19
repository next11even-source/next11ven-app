'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

function AuthConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/set-password'

  useEffect(() => {
    const supabase = createClient()

    // createBrowserClient has detectSessionInUrl: true by default — it reads the
    // PKCE code verifier directly from browser cookie storage and automatically
    // exchanges the ?code= param or processes any #access_token= hash fragment.
    // Listening for the resulting event is all we need.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        subscription.unsubscribe()
        router.replace(next)
      }
    })

    // Also handle the case where the session is already established by the time
    // the listener is registered (race condition on fast connections).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe()
        router.replace(next)
      }
    })

    // Fallback: if nothing resolves in 10 seconds, the link is broken or expired.
    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      router.replace('/claim?error=session_expired')
    }, 10000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router, next])

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="flex flex-col items-center gap-5">
        <img src="/logo.jpg" alt="NEXT11VEN" className="w-36 h-auto" />
        <div
          className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }}
        />
        <p className="text-xs uppercase tracking-widest" style={{ color: '#8892aa' }}>
          Verifying your link…
        </p>
      </div>
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense>
      <AuthConfirmContent />
    </Suspense>
  )
}
