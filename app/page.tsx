'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="password"
                className="text-xs uppercase tracking-wider"
                style={{ color: '#8892aa' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
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

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full py-3 text-sm font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#2d5fc4', color: '#ffffff' }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#3a6fda')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2d5fc4')}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <div className="text-center space-y-3">
          <div>
            <Link
              href="/register"
              className="text-sm uppercase tracking-wider transition-colors"
              style={{ color: '#2d5fc4' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#3a6fda')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#2d5fc4')}
            >
              Create an account →
            </Link>
          </div>
          <div>
            <Link
              href="/claim"
              className="text-sm uppercase tracking-wider transition-colors"
              style={{ color: '#8892aa' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#e8dece')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8892aa')}
            >
              First time? Claim your account →
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
