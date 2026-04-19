'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

const POSITIONS = [
  'Goalkeeper', 'Right Back', 'Centre Back', 'Left Back',
  'Defensive Midfielder', 'Central Midfielder', 'Right Midfielder',
  'Left Midfielder', 'Attacking Midfielder', 'Right Winger',
  'Left Winger', 'Second Striker', 'Striker', 'Centre Forward',
]

const PLAYING_LEVELS = [
  'Premier League', 'Championship', 'League One', 'League Two',
  'National League', 'National League North/South', 'Step 3', 'Step 4',
  'Step 5', 'Step 6', 'Step 7 and below',
]

const COACHING_LEVELS = [
  'Premier League', 'Championship', 'League One', 'League Two',
  'National League', 'National League North/South', 'Step 3', 'Step 4',
  'Step 5', 'Step 6', 'Step 7 and below',
]

const COACHING_ROLES = [
  'Head Coach / Manager', 'Assistant Manager', 'Goalkeeper Coach',
  'Fitness Coach', 'Scout', 'Director of Football', 'Other',
]

const inputStyle = {
  backgroundColor: '#0a0a0a',
  border: '1px solid #1e2235',
  color: '#e8dece',
}

const labelStyle = {
  color: '#8892aa',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wider" style={labelStyle}>{label}</label>
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

export default function RegisterPage() {
  const router = useRouter()
  const [role, setRole] = useState<'player' | 'coach' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Shared fields
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [city, setCity] = useState('')
  const [location, setLocation] = useState('')
  const [referral, setReferral] = useState('')
  const [gdpr, setGdpr] = useState(false)

  // Player fields
  const [playingLevel, setPlayingLevel] = useState('')
  const [club, setClub] = useState('')
  const [position, setPosition] = useState('')
  const [secondaryPosition, setSecondaryPosition] = useState('')
  const [foot, setFoot] = useState('')
  const [status, setStatus] = useState('just_exploring')
  const [highlightUrl, setHighlightUrl] = useState('')
  const [height, setHeight] = useState('')

  // Coach fields
  const [coachingRole, setCoachingRole] = useState('')
  const [coachingLevel, setCoachingLevel] = useState('')
  const [coachClub, setCoachClub] = useState('')
  const [coachingHistory, setCoachingHistory] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role) return
    if (!gdpr) { setError('You must accept the terms to continue.'); return }

    setError(null)
    setLoading(true)

    const supabase = createClient()

    // 1. Create auth user
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    const userId = authData.user?.id
    if (!userId) {
      setError('Account created — please check your email to confirm, then sign in.')
      setLoading(false)
      return
    }

    // 2. Build profile payload
    const profilePayload: Record<string, unknown> = {
      full_name: fullName,
      email,
      phone: phone || null,
      sms_opt_in: !!phone,
      date_of_birth: dob || null,
      role,
      city: city || null,
      location: location || null,
      referral: referral || null,
      gdpr_consent: gdpr,
      approved: false,
      approval_status: 'pending',
    }

    if (role === 'player') {
      profilePayload.playing_level = playingLevel || null
      profilePayload.club = club || null
      profilePayload.position = position || null
      profilePayload.secondary_position = secondaryPosition || null
      profilePayload.foot = foot || null
      profilePayload.status = status
      profilePayload.highlight_urls = highlightUrl ? [highlightUrl] : []
      profilePayload.height = height || null
    } else if (role === 'coach') {
      profilePayload.coaching_role = coachingRole || null
      profilePayload.coaching_level = coachingLevel || null
      profilePayload.club = coachClub || null
      profilePayload.coaching_history = coachingHistory || null
    }

    // 3. Upsert profile (handles cases where trigger may not have fired)
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: userId, ...profilePayload })

    if (profileError) {
      setError('Account created but profile update failed: ' + profileError.message)
      setLoading(false)
      return
    }

    router.push('/pending')
  }

  return (
    <div className="min-h-screen px-4 py-12" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="max-w-lg mx-auto space-y-8">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <img src="/logo.jpg" alt="NEXT11VEN" className="w-48 h-auto" />
          <p className="text-xs uppercase tracking-widest" style={{ color: '#8892aa' }}>
            Create Your Account
          </p>
        </div>

        {/* Role selector */}
        {!role ? (
          <div className="space-y-4">
            <p className="text-center text-sm uppercase tracking-wider" style={{ color: '#8892aa' }}>
              I am joining as a…
            </p>
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
                  <div className="text-lg font-bold uppercase"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                    {label}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Role badge + change */}
            <div className="flex items-center justify-between">
              <span
                className="text-xs uppercase tracking-wider px-3 py-1 rounded-full"
                style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', color: '#2d5fc4' }}
              >
                {role === 'player' ? 'Player' : 'Coach / Manager'}
              </span>
              <button
                type="button"
                onClick={() => setRole(null)}
                className="text-xs uppercase tracking-wider"
                style={{ color: '#8892aa' }}
              >
                Change
              </button>
            </div>

            {/* Section: Personal Details */}
            <Section title="Personal Details">
              <Field label="Full Name">
                <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Marcus Johnson" />
              </Field>
              <Field label="Email">
                <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </Field>
              <Field label="Password">
                <Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} />
              </Field>
              <Field label="Phone (+44 format)">
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+447700900000" />
              </Field>
              <Field label="Date of Birth">
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nearest City">
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Manchester" />
                </Field>
                <Field label="Town / City Based In">
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Salford" />
                </Field>
              </div>
            </Section>

            {/* Player fields */}
            {role === 'player' && (
              <Section title="Player Details">
                <Field label="Most Recent Playing Level">
                  <Select value={playingLevel} onChange={(e) => setPlayingLevel(e.target.value)}>
                    <option value="">Select level…</option>
                    {PLAYING_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Current Club (or Free Agent)">
                  <Input value={club} onChange={(e) => setClub(e.target.value)} placeholder="e.g. Abbey Hey FC" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Best Position">
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
                    <Input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="e.g. 5'11" />
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

            {/* Coach fields */}
            {role === 'coach' && (
              <Section title="Coaching Details">
                <Field label="Your Role">
                  <Select value={coachingRole} onChange={(e) => setCoachingRole(e.target.value)}>
                    <option value="">Select role…</option>
                    {COACHING_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </Field>
                <Field label="Most Recent Level Managed / Coached">
                  <Select value={coachingLevel} onChange={(e) => setCoachingLevel(e.target.value)}>
                    <option value="">Select level…</option>
                    {COACHING_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Current Club (or No Club)">
                  <Input value={coachClub} onChange={(e) => setCoachClub(e.target.value)} placeholder="e.g. Abbey Hey FC" />
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

            <Section title="Referral (Optional)">
              <Field label="Referred by (full name)">
                <Input value={referral} onChange={(e) => setReferral(e.target.value)} placeholder="Friend's full name" />
              </Field>
            </Section>

            {/* GDPR */}
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
            >
              <label className="flex gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gdpr}
                  onChange={(e) => setGdpr(e.target.checked)}
                  className="mt-0.5 flex-shrink-0 accent-blue-500"
                />
                <span className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>
                  I understand and accept that the information I have provided may be stored and shared through the NEXT11VEN platform for the purpose of connecting players with managers, clubs and scouts. I give permission for parts of my profile to be visible to clubs, coaches, and (where applicable) the public. The information I have provided is accurate, and I agree to the storage and use of my data. I may request to have my data removed at any time.
                </span>
              </label>
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
              disabled={loading || !gdpr}
              className="w-full rounded-full py-3 text-sm font-semibold uppercase tracking-wider transition-colors disabled:opacity-40"
              style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#3a6fda')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2d5fc4')}
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>

            <p className="text-center text-xs" style={{ color: '#8892aa' }}>
              Already have an account?{' '}
              <Link href="/" style={{ color: '#2d5fc4' }}>Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
    >
      <h3
        className="text-sm font-bold uppercase"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
      >
        {title}
      </h3>
      {children}
    </div>
  )
}
