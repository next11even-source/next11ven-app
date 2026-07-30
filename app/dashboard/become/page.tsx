'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { POSITIONS } from '@/lib/positions'
import { LEVELS } from '@/lib/levels'
import { toTitleCase } from '@/lib/utils'
import { dobBounds, DOB_HELP } from '@/lib/dob'
import { HEIGHT_OPTIONS } from '@/lib/height'

const { min: DOB_MIN, max: DOB_MAX } = dobBounds()

const COACHING_ROLES = [
  'Head Coach / Manager', 'Assistant Manager', 'Goalkeeper Coach',
  'Fitness Coach', 'Scout', 'Director of Football', 'Other',
]

const inputStyle = {
  backgroundColor: '#0a0a0a',
  border: '1px solid #1e2235',
  color: '#e8dece',
}
const labelStyle = { color: '#8892aa' }

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wider" style={labelStyle}>
        {label}{required && <span style={{ color: '#f59e0b' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
      style={inputStyle}
      onFocus={(e) => { e.currentTarget.style.borderColor = '#2d5fc4'; props.onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.borderColor = '#1e2235'; props.onBlur?.(e) }}
    />
  )
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
      style={inputStyle}
      onFocus={(e) => { e.currentTarget.style.borderColor = '#2d5fc4'; props.onFocus?.(e) }}
      onBlur={(e) => { e.currentTarget.style.borderColor = '#1e2235'; props.onBlur?.(e) }}
    >
      {children}
    </select>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <h3 className="text-sm font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

export default function BecomePage() {
  const [checking, setChecking] = useState(true)
  const [notFan, setNotFan] = useState(false)
  const [role, setRole] = useState<'player' | 'coach' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shared
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [city, setCity] = useState('')

  // Player
  const [playingLevel, setPlayingLevel] = useState('')
  const [club, setClub] = useState('')
  const [position, setPosition] = useState('')
  const [secondaryPosition, setSecondaryPosition] = useState('')
  const [foot, setFoot] = useState('')
  const [status, setStatus] = useState('just_exploring')
  const [height, setHeight] = useState('')
  const [highlightUrl, setHighlightUrl] = useState('')

  // Coach
  const [coachingRole, setCoachingRole] = useState('')
  const [coachingLevel, setCoachingLevel] = useState('')
  const [coachingHistory, setCoachingHistory] = useState('')

  // Prefill from the existing fan profile
  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setChecking(false); return }
      const { data: p } = await supabase
        .from('profiles')
        .select('role, full_name, phone, city, club')
        .eq('id', user.id)
        .single()
      if (p && p.role !== 'fan') { setNotFan(true); setChecking(false); return }
      if (p) {
        setFullName(p.full_name ?? '')
        setPhone(p.phone ?? '')
        setCity(p.city ?? '')
        setClub(p.club ?? '')
      }
      setChecking(false)
    })()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) return
    setError(null)
    setLoading(true)

    const payload: Record<string, unknown> = {
      role,
      full_name: fullName,
      phone: phone || null,
      city: city || null,
    }
    if (role === 'player') {
      Object.assign(payload, {
        date_of_birth: dob || null,
        playing_level: playingLevel || null,
        club: club || null,
        position: position || null,
        secondary_position: secondaryPosition || null,
        foot: foot || null,
        status,
        height: height || null,
        highlight_urls: highlightUrl ? [highlightUrl] : [],
      })
    } else {
      Object.assign(payload, {
        coaching_role: coachingRole || null,
        coaching_level: coachingLevel || null,
        club: club || null,
        coaching_history: coachingHistory || null,
      })
    }

    const res = await fetch('/api/account/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      setError(data.message ?? data.error ?? 'Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    // Full reload so middleware + role-aware shells pick up the new role.
    window.location.href = role === 'coach' ? '/dashboard/coach' : '/dashboard/player'
  }

  if (checking) {
    return <div className="min-h-screen px-4 py-12" style={{ backgroundColor: '#0a0a0a' }} />
  }

  if (notFan) {
    return (
      <div className="min-h-screen px-4 py-12" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="max-w-lg mx-auto text-center space-y-4">
          <p className="text-sm" style={{ color: '#8892aa' }}>Your account is already a full player or coach account.</p>
          <Link href="/dashboard/player" className="text-sm" style={{ color: '#2d5fc4' }}>Back to dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-10" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-lg mx-auto space-y-7">

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Unlock Your Full Account
          </h1>
          <p className="text-sm" style={{ color: '#8892aa' }}>
            You&apos;re browsing as a Supporter. Add your details to become a Player or Coach — then you can message, post, apply to roles and be discovered.
          </p>
        </div>

        {!role ? (
          <div className="space-y-4">
            <p className="text-center text-sm uppercase tracking-wider" style={{ color: '#8892aa' }}>I want to join as a…</p>
            <div className="grid grid-cols-2 gap-4">
              {([
                { r: 'player', icon: '⚽', label: 'Player' },
                { r: 'coach', icon: '📋', label: 'Coach / Manager' },
              ] as const).map(({ r, icon, label }) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className="rounded-xl py-8 text-center transition-all"
                  style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
                >
                  <div className="text-3xl mb-2">{icon}</div>
                  <div className="text-lg font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{label}</div>
                </button>
              ))}
            </div>
            <div className="text-center">
              <Link href="/dashboard/player" className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Maybe later</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider px-3 py-1 rounded-full"
                style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', color: '#2d5fc4' }}>
                {role === 'player' ? 'Player' : 'Coach / Manager'}
              </span>
              <button type="button" onClick={() => { setRole(null); setError(null) }} className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Change</button>
            </div>

            <Section title="Your Details">
              <Field label="Full Name" required>
                <Input required value={fullName} onChange={(e) => setFullName(toTitleCase(e.target.value))} placeholder="e.g. Marcus Johnson" />
              </Field>
              <Field label="Mobile Number" required>
                <Input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07700 900000" />
              </Field>
              {role === 'player' && (
                <Field label="Date of Birth" required>
                  <Input type="date" value={dob} min={DOB_MIN} max={DOB_MAX} onChange={(e) => setDob(e.target.value)} />
                  <p className="text-xs mt-1" style={{ color: '#8892aa' }}>{DOB_HELP}</p>
                </Field>
              )}
              <Field label="Nearest City" required>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Manchester" />
              </Field>
            </Section>

            {role === 'player' && (
              <Section title="Player Details">
                <Field label="Most Recent Playing Level" required>
                  <Select value={playingLevel} onChange={(e) => setPlayingLevel(e.target.value)}>
                    <option value="">Select level…</option>
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Current Club (or Free Agent)" required>
                  <Input value={club} onChange={(e) => setClub(e.target.value)} placeholder="e.g. Abbey Hey FC" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Best Position" required>
                    <Select value={position} onChange={(e) => setPosition(e.target.value)}>
                      <option value="">Select…</option>
                      {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </Select>
                  </Field>
                  <Field label="Secondary Position">
                    <Select value={secondaryPosition} onChange={(e) => setSecondaryPosition(e.target.value)}>
                      <option value="">Select…</option>
                      {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Strongest Foot">
                    <Select value={foot} onChange={(e) => setFoot(e.target.value)}>
                      <option value="">Select…</option>
                      <option value="Right">Right</option>
                      <option value="Left">Left</option>
                      <option value="Both">Both</option>
                    </Select>
                  </Field>
                  <Field label="Height">
                    <Select value={height} onChange={(e) => setHeight(e.target.value)}>
                      <option value="">Select…</option>
                      {HEIGHT_OPTIONS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                    </Select>
                  </Field>
                </div>
                <Field label="Current Status">
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="free_agent">Free Agent</option>
                    <option value="signed">Signed to a club</option>
                    <option value="loan_dual_reg">Looking for Loan / Dual Reg</option>
                    <option value="just_exploring">Just Exploring</option>
                  </Select>
                </Field>
                <Field label="Highlight Reel (YouTube URL)">
                  <Input type="url" value={highlightUrl} onChange={(e) => setHighlightUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                </Field>
              </Section>
            )}

            {role === 'coach' && (
              <Section title="Coaching Details">
                <Field label="Your Role" required>
                  <Select value={coachingRole} onChange={(e) => setCoachingRole(e.target.value)}>
                    <option value="">Select role…</option>
                    {COACHING_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </Field>
                <Field label="Most Recent Level Managed / Coached" required>
                  <Select value={coachingLevel} onChange={(e) => setCoachingLevel(e.target.value)}>
                    <option value="">Select level…</option>
                    {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Current Club (or No Club)" required>
                  <Input value={club} onChange={(e) => setClub(e.target.value)} placeholder="e.g. Abbey Hey FC" />
                </Field>
                <Field label="Coaching History (Previous Clubs)">
                  <textarea
                    value={coachingHistory}
                    onChange={(e) => setCoachingHistory(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg px-4 py-2.5 text-sm outline-none resize-none"
                    style={inputStyle}
                    placeholder="List your previous clubs…"
                    onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
                  />
                </Field>
              </Section>
            )}

            {error && (
              <p className="text-sm rounded-lg px-4 py-3" style={{ color: '#f87171', backgroundColor: 'rgba(248,113,113,0.08)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full py-3 text-sm font-semibold uppercase tracking-wider transition-colors disabled:opacity-40"
              style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#3a6fda')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2d5fc4')}
            >
              {loading ? 'Unlocking…' : `Become a ${role === 'coach' ? 'Coach' : 'Player'}`}
            </button>
            <p className="text-center leading-tight" style={{ color: '#8892aa', fontSize: 11 }}>
              Fields marked <span style={{ color: '#f59e0b' }}>*</span> are required. Your access unlocks instantly.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
