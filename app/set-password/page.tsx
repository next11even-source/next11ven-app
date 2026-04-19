'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function SetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'checking'>('checking')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Guard: if no active session (expired link, different device), redirect to
  // /claim so the user can request a fresh link rather than seeing a broken form.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/claim?error=session_expired')
      } else {
        setStatus('idle')
      }
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.')
      return
    }

    if (password !== confirm) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setStatus('loading')
    const supabase = createClient()

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setErrorMsg(updateError.message)
      setStatus('error')
      return
    }

    // Fetch profile to route to correct dashboard
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/')
      return
    }

    // Primary lookup by auth user ID
    let { data: profile } = await supabase
      .from('profiles')
      .select('role, approved, approval_status')
      .eq('id', user.id)
      .single()

    // Migration fallback: profile exists under the old Glide ID but same email.
    // Update the profile ID so future logins work normally.
    if ((!profile || !profile.approved) && user.email) {
      const { data: byEmail } = await supabase
        .from('profiles')
        .select('role, approved, approval_status')
        .eq('email', user.email)
        .neq('id', user.id)
        .single()

      if (byEmail?.approved || byEmail?.approval_status === 'approved') {
        // Re-link profile to the new auth user ID
        await supabase
          .from('profiles')
          .update({ id: user.id })
          .eq('email', user.email)
        profile = byEmail
      }
    }

    const isApproved = profile?.approved === true || profile?.approval_status === 'approved'
    if (!isApproved) {
      router.push('/pending')
      return
    }

    const dest = profile!.role === 'coach' ? '/dashboard/coach'
               : profile!.role === 'admin'  ? '/dashboard/player'
               : '/dashboard/player'
    router.push(dest)
  }

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
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
              Set Your Password
            </h2>
            <p className="text-sm mt-1 leading-relaxed" style={{ color: '#8892aa' }}>
              Choose a strong password to secure your account. You'll use this
              every time you sign in.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="text-xs uppercase tracking-wider"
                style={{ color: '#8892aa' }}
              >
                New Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
                placeholder="Min. 8 characters"
              />
            </div>

            <div className="space-y-1">
              <label
                htmlFor="confirm"
                className="text-xs uppercase tracking-wider"
                style={{ color: '#8892aa' }}
              >
                Confirm Password
              </label>
              <input
                id="confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
                style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
                placeholder="Repeat your password"
              />
            </div>

            {/* Strength hint */}
            {password.length > 0 && (
              <div className="flex gap-1">
                {[8, 12, 16].map((threshold, i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{
                      backgroundColor:
                        password.length >= threshold ? '#2d5fc4' : '#1e2235',
                    }}
                  />
                ))}
                <span className="text-xs ml-1" style={{ color: '#8892aa' }}>
                  {password.length < 8 ? 'Too short' : password.length < 12 ? 'Fair' : password.length < 16 ? 'Good' : 'Strong'}
                </span>
              </div>
            )}

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
              {status === 'loading' ? 'Saving…' : 'Set Password & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
