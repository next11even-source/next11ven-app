'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

function AuthConfirmContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/set-password'
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function handleConfirm() {
      // PKCE flow — Supabase appends ?code= after verifying the OTP server-side
      const code = searchParams.get('code')
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (data.session) {
          router.replace(next)
          return
        }
        // code exchange failed — show error rather than silently looping
        setErrorMsg(error?.message ?? 'Link could not be verified.')
        return
      }

      // token_hash flow (Supabase sends token_hash + type directly to the app)
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      if (token_hash && type) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash,
          type: type as 'email' | 'magiclink' | 'recovery',
        })
        if (data.session) {
          router.replace(next)
          return
        }
        setErrorMsg(error?.message ?? 'Link could not be verified.')
        return
      }

      // Implicit flow — access_token in hash fragment, detectSessionInUrl already processed it
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace(next)
        return
      }

      // Nothing in the URL — likely opened a stale/direct URL
      setErrorMsg('No verification token found in the link. Try requesting a new one.')
    }

    handleConfirm()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-full max-w-sm space-y-6 text-center">
          <img src="/logo.jpg" alt="NEXT11VEN" className="w-36 h-auto mx-auto" />
          <div className="rounded-2xl px-6 py-5" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm font-semibold mb-1" style={{ color: '#f87171' }}>Link expired or invalid</p>
            <p className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>{errorMsg}</p>
          </div>
          <a href="/claim" className="block text-sm uppercase tracking-wider" style={{ color: '#2d5fc4' }}>
            Request a new link →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="flex flex-col items-center gap-5">
        <img src="/logo.jpg" alt="NEXT11VEN" className="w-36 h-auto" />
        <div
          className="w-6 h-6 rounded-full border-2 animate-spin"
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
