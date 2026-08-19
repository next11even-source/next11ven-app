'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import Button from '@/components/ui/Button'
import { ChevronRight } from 'lucide-react'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Forgot password state
  const [forgotMode, setForgotMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.refresh()
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetError(null)
    setResetLoading(true)

    try {
      const supabase = createClient()
      const redirectTo = `${window.location.origin}/auth/callback?next=/set-password`
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo })

      setResetLoading(false)
      if (error) {
        setResetError(error.message || 'Something went wrong — please try again')
        return
      }
      setResetSent(true)
    } catch {
      setResetLoading(false)
      setResetError('Something went wrong — please try again')
    }
  }

  const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' } as const

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <div className="w-full max-w-sm space-y-10">

        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <img
            src="/logo.jpg"
            alt="NEXT11VEN"
            className="w-56 h-auto"
          />
          <p className="text-xs uppercase tracking-widest" style={{ color: '#8892aa' }}>
            Non-League Recruitment
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 space-y-6"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
        >
          {forgotMode ? (
            <>
              <div>
                <h2
                  className="text-xl font-bold uppercase"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
                >
                  Reset Password
                </h2>
                <p className="text-sm mt-1" style={{ color: '#8892aa' }}>
                  Enter your email and we'll send a reset link
                </p>
              </div>

              {resetSent ? (
                <div className="space-y-4">
                  <p
                    className="text-sm rounded-lg px-4 py-3"
                    style={{ color: '#e8dece', backgroundColor: 'rgba(45,95,196,0.12)', border: '1px solid rgba(45,95,196,0.3)' }}
                  >
                    Check your email — a reset link is on its way to <strong>{resetEmail}</strong>.
                  </p>
                  <Button
                    onClick={() => { setForgotMode(false); setResetSent(false); setResetEmail('') }}
                    variant="secondary" size="md" className="w-full rounded-full"
                  >
                    Back to Sign In
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-1">
                    <label htmlFor="reset-email" className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>
                      Email
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                      style={inputStyle}
                      onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
                      onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
                      placeholder="you@example.com"
                    />
                  </div>

                  {resetError && (
                    <p className="text-sm rounded-lg px-4 py-3" style={{ color: '#f87171', backgroundColor: 'rgba(248,113,113,0.08)' }}>
                      {resetError}
                    </p>
                  )}

                  <Button type="submit" loading={resetLoading} variant="primary" size="md" className="w-full rounded-full">
                    Send Reset Link
                  </Button>

                  <button
                    type="button"
                    onClick={() => setForgotMode(false)}
                    className="w-full text-sm uppercase tracking-wider"
                    style={{ color: '#8892aa' }}
                  >
                    ← Back to Sign In
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <div>
                <h2
                  className="text-xl font-bold uppercase"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
                >
                  Sign In
                </h2>
                <p className="text-sm mt-1" style={{ color: '#8892aa' }}>
                  Access your account
                </p>
              </div>

              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1">
                  <label
                    htmlFor="email"
                    className="text-xs uppercase tracking-wider"
                    style={{ color: '#8892aa' }}
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
                    placeholder="you@example.com"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="text-xs uppercase tracking-wider"
                      style={{ color: '#8892aa' }}
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => { setForgotMode(true); setResetEmail(email) }}
                      className="text-xs transition-colors"
                      style={{ color: '#8892aa' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#e8dece')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#8892aa')}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                    style={inputStyle}
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
                    placeholder="••••••••"
                  />
                </div>

                {error && (
                  <p
                    className="text-sm rounded-lg px-4 py-3"
                    style={{ color: '#f87171', backgroundColor: 'rgba(248,113,113,0.08)' }}
                  >
                    {error}
                  </p>
                )}

                <Button type="submit" loading={loading} variant="primary" size="md" className="w-full rounded-full">
                  Sign In
                </Button>
              </form>
            </>
          )}
        </div>

        <div className="text-center space-y-3">
          <div>
            <Button variant="tertiary" size="sm" href="/register" trailingIcon={ChevronRight}>
              Create an account
            </Button>
          </div>
          <div>
            <Button variant="secondary" size="md" href="/claim" className="w-full rounded-full"
              style={{ color: '#4d8ae8', backgroundColor: 'rgba(45,95,196,0.12)', borderColor: 'rgba(45,95,196,0.4)' }}
              trailingIcon={ChevronRight}>
              First time on the new app? Create your password
            </Button>
          </div>
        </div>

      </div>
    </div>
  )
}
