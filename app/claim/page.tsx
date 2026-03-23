'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

export default function ClaimPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Surface the error from the callback redirect if present
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'invalid_link' && status === 'idle' && !errorMsg) {
      setErrorMsg('That link has expired or is invalid. Please request a new one.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    setStatus('loading')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/set-password`,
        shouldCreateUser: true,
      },
    })

    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
      return
    }

    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ backgroundColor: '#0a0a0a' }}
      >
        <div className="w-full max-w-sm space-y-10 text-center">
          <div className="flex justify-center">
            <img src="/logo.jpg" alt="NEXT11VEN" className="w-48 h-auto" />
          </div>

          <div
            className="rounded-2xl p-8 space-y-4"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
          >
            <div
              className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(45,95,196,0.15)' }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>

            <h2
              className="text-xl font-bold uppercase"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
            >
              Check your email
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
              We've sent a secure link to <span style={{ color: '#e8dece' }}>{email}</span>.
              Click it to set your password and activate your account.
            </p>
            <p className="text-xs" style={{ color: '#8892aa' }}>
              The link expires in 1 hour. Check your spam folder if you don't see it.
            </p>
          </div>

          <Link
            href="/"
            className="block text-sm uppercase tracking-wider transition-colors"
            style={{ color: '#8892aa' }}
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <div className="w-full max-w-sm space-y-10">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.jpg" alt="NEXT11VEN" className="w-56 h-auto" />
          <p className="text-xs uppercase tracking-widest" style={{ color: '#8892aa' }}>
            Account Setup
          </p>
        </div>

        <div
          className="rounded-2xl p-8 space-y-6"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
        >
          <div>
            <h2
              className="text-xl font-bold uppercase"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
            >
              Claim Your Account
            </h2>
            <p className="text-sm mt-1 leading-relaxed" style={{ color: '#8892aa' }}>
              Enter the email address associated with your existing profile.
              We'll send you a secure link to set your password.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="email"
                className="text-xs uppercase tracking-wider"
                style={{ color: '#8892aa' }}
              >
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
              <p
                className="text-sm rounded-lg px-4 py-3"
                style={{ color: '#f87171', backgroundColor: 'rgba(248,113,113,0.08)' }}
              >
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
              {status === 'loading' ? 'Sending…' : 'Send Setup Link'}
            </button>
          </form>
        </div>

        <div className="text-center">
          <Link
            href="/"
            className="text-sm uppercase tracking-wider transition-colors"
            style={{ color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e8dece')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8892aa')}
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
