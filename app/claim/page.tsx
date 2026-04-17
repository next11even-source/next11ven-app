'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

export default function ClaimPage() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const linkExpired = searchParams.get('error') === 'invalid_link'

  // Pre-fill email from query param if redirected from an expired link
  useEffect(() => {
    const e = searchParams.get('email')
    if (e) setEmail(e)
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setStatus('loading')

    const supabase = createClient()
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${base}/auth/callback?next=/set-password`,
        shouldCreateUser: false,
      },
    })

    if (error) {
      setErrorMsg(error.message || 'Something went wrong — please try again')
      setStatus('error')
      return
    }

    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-full max-w-sm space-y-10 text-center">
          <div className="flex justify-center">
            <img src="/logo.jpg" alt="NEXT11VEN" className="w-48 h-auto" />
          </div>
          <div className="rounded-2xl p-8 space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(45,95,196,0.15)' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <h2 className="text-xl font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Check your email
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
              We've sent a secure link to <span style={{ color: '#e8dece' }}>{email}</span>.
              Click it to set your password and get into your account.
            </p>
            <p className="text-xs" style={{ color: '#8892aa' }}>
              Link expires in 1 hour. Check your spam folder if you don't see it.
            </p>
          </div>
          <Link href="/" className="block text-sm uppercase tracking-wider" style={{ color: '#8892aa' }}>
            ← Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="w-full max-w-sm space-y-10">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.jpg" alt="NEXT11VEN" className="w-56 h-auto" />
          <p className="text-xs uppercase tracking-widest" style={{ color: '#8892aa' }}>Account Setup</p>
        </div>

        {/* Expired link banner */}
        {linkExpired && (
          <div className="rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>Your link has expired</p>
            <p className="text-xs mt-1" style={{ color: '#8892aa' }}>
              Password setup links are single-use and expire after 1 hour. Enter your email below to get a fresh one.
            </p>
          </div>
        )}

        <div className="rounded-2xl p-8 space-y-6" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div>
            <h2 className="text-xl font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Set Your Password
            </h2>
            <p className="text-sm mt-1 leading-relaxed" style={{ color: '#8892aa' }}>
              Already a NEXT11VEN member but haven't set a password yet? Enter your email and we'll send you a secure link to get access.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="email" className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
                placeholder="you@example.com"
              />
            </div>

            {errorMsg && (
              <p className="text-sm rounded-lg px-4 py-3" style={{ color: '#f87171', backgroundColor: 'rgba(248,113,113,0.08)' }}>
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full rounded-full py-3 text-sm font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#2d5fc4', color: '#ffffff' }}
              onMouseEnter={(e) => status !== 'loading' && (e.currentTarget.style.backgroundColor = '#3a6fda')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2d5fc4')}
            >
              {status === 'loading' ? 'Sending…' : 'Send Me a Link'}
            </button>
          </form>
        </div>

        <div className="text-center space-y-3">
          <p className="text-xs" style={{ color: '#3a4055' }}>
            Already have a password?
          </p>
          <Link
            href="/"
            className="text-sm uppercase tracking-wider transition-colors"
            style={{ color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e8dece')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8892aa')}
          >
            ← Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
