'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string
  full_name: string | null
  position: string | null
  club: string | null
  bio: string | null
  avatar_url: string | null
  status: 'available' | 'open_to_offers' | 'not_available' | null
  goals: number
  assists: number
  appearances: number
  season: string | null
  streak_weeks: number
  streak_last_week: string | null
  last_active: string | null
  highlight_urls: string[]
  premium: boolean
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  open_to_offers: 'Open to Offers',
  not_available: 'Not Available',
}

const STATUS_COLORS: Record<string, string> = {
  available: '#4ade80',
  open_to_offers: '#60a5fa',
  not_available: '#8892aa',
}

const POSITIONS = [
  'Goalkeeper',
  'Right Back',
  'Centre Back',
  'Left Back',
  'Defensive Midfielder',
  'Central Midfielder',
  'Right Midfielder',
  'Left Midfielder',
  'Attacking Midfielder',
  'Right Winger',
  'Left Winger',
  'Second Striker',
  'Striker',
  'Centre Forward',
]

function getISOWeek(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function getPrevISOWeek(): string {
  const now = new Date()
  now.setDate(now.getDate() - 7)
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function calcStreak(current: number, lastWeek: string | null): { streak: number; lastWeek: string } {
  const thisWeek = getISOWeek()
  if (lastWeek === thisWeek) return { streak: current, lastWeek }
  if (lastWeek === getPrevISOWeek()) return { streak: current + 1, lastWeek: thisWeek }
  return { streak: 1, lastWeek: thisWeek }
}

function isActiveThisWeek(lastActive: string | null): boolean {
  if (!lastActive) return false
  const diff = Date.now() - new Date(lastActive).getTime()
  return diff < 7 * 24 * 60 * 60 * 1000
}

type CompletionItem = { label: string; done: boolean; weight: number }

function calcCompletion(p: Profile): { score: number; items: CompletionItem[]; nextStep: string | null } {
  const items: CompletionItem[] = [
    { label: 'Upload a profile photo',    done: !!p.avatar_url,                                          weight: 15 },
    { label: 'Add your full name',        done: !!p.full_name,                                            weight: 10 },
    { label: 'Set your position',         done: !!p.position,                                             weight: 15 },
    { label: 'Add your current club',     done: !!p.club,                                                 weight: 10 },
    { label: 'Write a short bio',         done: !!p.bio && p.bio.length > 10,                             weight: 15 },
    { label: 'Enter your season stats',   done: (p.goals > 0 || p.assists > 0 || p.appearances > 0),     weight: 15 },
    { label: 'Add a highlight video',     done: p.highlight_urls?.length > 0,                             weight: 15 },
    { label: 'Set your availability',     done: !!p.status,                                               weight: 5  },
  ]
  const score = items.filter(i => i.done).reduce((sum, i) => sum + i.weight, 0)
  const nextStep = items.find(i => !i.done)?.label ?? null
  return { score, items, nextStep }
}

function nudgeCopy(score: number, nextStep: string | null): string {
  if (score === 100) return 'Elite profile — you\'re fully visible to all coaches.'
  if (score >= 80) return `Almost there — ${nextStep?.toLowerCase()} to reach 100%.`
  if (score >= 60) return `Coaches can find you, but ${nextStep?.toLowerCase()} will make you stand out.`
  if (score >= 30) return `You're on coaches' radar but missing key info — ${nextStep?.toLowerCase()}.`
  return 'Your profile is barely started — coaches can\'t find you yet.'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompletionBar({ profile }: { profile: Profile }) {
  const { score, nextStep } = calcCompletion(profile)
  const color = score === 100 ? '#4ade80' : score >= 60 ? '#2d5fc4' : '#f59e0b'

  return (
    <div
      className="rounded-xl p-5 space-y-3"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-sm font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
        >
          Profile Completion
        </span>
        <span className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color }}>
          {score}%
        </span>
      </div>

      {/* Bar */}
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#1e2235' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>

      {/* Nudge */}
      <p className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>
        {nudgeCopy(score, nextStep)}
      </p>

      {/* Checklist */}
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        {calcCompletion(profile).items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span style={{ color: item.done ? '#4ade80' : '#1e2235', fontSize: 14 }}>
              {item.done ? '✓' : '○'}
            </span>
            <span className="text-xs" style={{ color: item.done ? '#8892aa' : '#e8dece' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatsCard({ profile, onSave }: { profile: Profile; onSave: (updates: Partial<Profile>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [goals, setGoals] = useState(profile.goals ?? 0)
  const [assists, setAssists] = useState(profile.assists ?? 0)
  const [appearances, setAppearances] = useState(profile.appearances ?? 0)
  const [season, setSeason] = useState(profile.season ?? '2024/25')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await onSave({ goals, assists, appearances, season })
    setSaving(false)
    setEditing(false)
  }

  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3
            className="text-sm font-bold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
          >
            Season Stats
          </h3>
          {!editing && (
            <p className="text-xs" style={{ color: '#8892aa' }}>{season}</p>
          )}
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
          >
            Update
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(false)}
              className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full"
              style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Season</label>
            <input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
              placeholder="e.g. 2024/25"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Goals', value: goals, set: setGoals },
              { label: 'Assists', value: assists, set: setAssists },
              { label: 'Apps', value: appearances, set: setAppearances },
            ].map(({ label, value, set }) => (
              <div key={label} className="space-y-1">
                <label className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{label}</label>
                <input
                  type="number"
                  min={0}
                  value={value}
                  onChange={(e) => set(Number(e.target.value))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-center outline-none"
                  style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Goals', value: profile.goals ?? 0 },
            { label: 'Assists', value: profile.assists ?? 0 },
            { label: 'Apps', value: profile.appearances ?? 0 },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg p-3 text-center"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}
            >
              <p
                className="text-2xl font-black"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
              >
                {value}
              </p>
              <p className="text-xs uppercase tracking-wider mt-0.5" style={{ color: '#8892aa' }}>{label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EditableCard({
  title,
  children,
  editContent,
  onSave,
}: {
  title: string
  children: React.ReactNode
  editContent: (cancel: () => void) => React.ReactNode
  onSave: () => void
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div
      className="rounded-xl p-5 space-y-3"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
    >
      <div className="flex items-center justify-between">
        <h3
          className="text-sm font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
        >
          {title}
        </h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
          >
            Edit
          </button>
        )}
      </div>
      {editing
        ? editContent(() => setEditing(false))
        : children}
    </div>
  )
}

// ─── Avatar Upload ─────────────────────────────────────────────────────────────

function AvatarUpload({ profile, onUploaded }: { profile: Profile; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB.')
      return
    }

    setError(null)
    setUploading(true)

    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError('Upload failed. Please try again.')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
    onUploaded(publicUrl)
    setUploading(false)
  }

  const initials = profile.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <div className="flex-shrink-0 relative group">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {/* Avatar circle — click to upload */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden relative transition-opacity disabled:opacity-50"
        style={{ backgroundColor: '#1e2235' }}
        title="Upload photo"
      >
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xl font-bold" style={{ color: '#8892aa' }}>{initials}</span>
        )}

        {/* Hover overlay */}
        <span
          className="absolute inset-0 flex flex-col items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        >
          {uploading ? (
            <span className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-xs text-white mt-1">Upload</span>
            </>
          )}
        </span>
      </button>

      {error && (
        <p className="absolute -bottom-5 left-0 text-xs whitespace-nowrap" style={{ color: '#f87171' }}>{error}</p>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PlayerProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (!data) return

      // Update last_active on page load
      await supabase
        .from('profiles')
        .update({ last_active: new Date().toISOString() })
        .eq('id', user.id)

      setProfile({ ...data, highlight_urls: data.highlight_urls ?? [] })
    }
    load()
  }, [])

  async function saveProfile(updates: Partial<Profile>) {
    if (!profile) return
    const supabase = createClient()

    // Recalculate streak on any save
    const { streak, lastWeek } = calcStreak(profile.streak_weeks, profile.streak_last_week)
    const payload = {
      ...updates,
      streak_weeks: streak,
      streak_last_week: lastWeek,
      last_active: new Date().toISOString(),
    }

    await supabase.from('profiles').update(payload).eq('id', profile.id)
    setProfile((p) => p ? { ...p, ...payload } : p)
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const active = isActiveThisWeek(profile.last_active)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Nav */}
      <header
        className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}
      >
        <img src="/logo.jpg" alt="NEXT11VEN" className="h-8 w-auto" />
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/player"
            className="text-xs uppercase tracking-wider transition-colors"
            style={{ color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e8dece')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8892aa')}
          >
            Home
          </Link>
          <button
            onClick={handleSignOut}
            className="text-xs uppercase tracking-wider px-4 py-2 rounded-full transition-colors"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e8dece')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8892aa')}
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Hero Card */}
        <div
          className="rounded-xl p-6"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
        >
          <div className="flex items-start gap-4">
            {/* Avatar with upload */}
            <AvatarUpload profile={profile} onUploaded={(url) => setProfile(p => p ? { ...p, avatar_url: url } : p)} />

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="text-2xl font-extrabold uppercase"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
                >
                  {profile.full_name ?? 'Your Name'}
                </h1>
                {/* Active badge */}
                <span
                  className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: active ? 'rgba(74,222,128,0.1)' : 'rgba(136,146,170,0.1)',
                    color: active ? '#4ade80' : '#8892aa',
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: active ? '#4ade80' : '#8892aa' }}
                  />
                  {active ? 'Active this week' : 'Inactive'}
                </span>
              </div>
              <p className="text-sm" style={{ color: '#8892aa' }}>
                {[profile.position, profile.club].filter(Boolean).join(' · ') || 'Add your position and club'}
              </p>

              {/* Streak */}
              {profile.streak_weeks > 0 && (
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-base">🔥</span>
                  <span className="text-xs font-semibold" style={{ color: '#e8dece' }}>
                    {profile.streak_weeks}-week streak
                  </span>
                  <span className="text-xs" style={{ color: '#8892aa' }}>
                    — keep it going
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Completion */}
        <CompletionBar profile={profile} />

        {/* Stats */}
        <StatsCard profile={profile} onSave={saveProfile} />

        {/* Bio */}
        <EditableCard
          title="About"
          editContent={(cancel) => (
            <BioEditor profile={profile} onSave={async (bio) => { await saveProfile({ bio }); cancel() }} onCancel={cancel} />
          )}
          onSave={() => {}}
        >
          {profile.bio
            ? <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>{profile.bio}</p>
            : <p className="text-sm italic" style={{ color: '#1e2235' }}>No bio yet — tell coaches about yourself.</p>
          }
        </EditableCard>

        {/* Details */}
        <EditableCard
          title="Details"
          editContent={(cancel) => (
            <DetailsEditor profile={profile} onSave={async (updates) => { await saveProfile(updates); cancel() }} onCancel={cancel} />
          )}
          onSave={() => {}}
        >
          <div className="space-y-2">
            {[
              { label: 'Position', value: profile.position },
              { label: 'Club', value: profile.club },
              {
                label: 'Availability',
                value: profile.status ? STATUS_LABELS[profile.status] : null,
                color: profile.status ? STATUS_COLORS[profile.status] : undefined,
              },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{label}</span>
                <span className="text-sm font-medium" style={{ color: color ?? '#e8dece' }}>
                  {value ?? <span style={{ color: '#1e2235' }}>Not set</span>}
                </span>
              </div>
            ))}
          </div>
        </EditableCard>

        {/* Highlights */}
        <EditableCard
          title="Highlight Videos"
          editContent={(cancel) => (
            <HighlightsEditor
              urls={profile.highlight_urls}
              premium={profile.premium}
              onSave={async (urls) => { await saveProfile({ highlight_urls: urls }); cancel() }}
              onCancel={cancel}
            />
          )}
          onSave={() => {}}
        >
          {profile.highlight_urls?.length > 0 ? (
            <div className="space-y-2">
              {profile.highlight_urls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm transition-colors"
                  style={{ color: '#2d5fc4' }}
                >
                  <span>▶</span>
                  <span className="truncate">{url}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm italic" style={{ color: '#1e2235' }}>
              No highlights added yet.{' '}
              {!profile.premium && <span style={{ color: '#8892aa' }}>Free players can add 1 video.</span>}
            </p>
          )}
        </EditableCard>

      </main>
    </div>
  )
}

// ─── Inline Editors ───────────────────────────────────────────────────────────

function BioEditor({ profile, onSave, onCancel }: { profile: Profile; onSave: (bio: string) => Promise<void>; onCancel: () => void }) {
  const [bio, setBio] = useState(profile.bio ?? '')
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-3">
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={4}
        maxLength={300}
        className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-none"
        style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
        onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
        onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
        placeholder="Tell coaches about your playing style, experience, and what you're looking for..."
      />
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: '#8892aa' }}>{bio.length}/300</span>
        <div className="flex gap-2">
          <button onClick={onCancel} className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full" style={{ border: '1px solid #1e2235', color: '#8892aa' }}>Cancel</button>
          <button
            onClick={async () => { setSaving(true); await onSave(bio); setSaving(false) }}
            disabled={saving}
            className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full disabled:opacity-50"
            style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailsEditor({ profile, onSave, onCancel }: { profile: Profile; onSave: (u: Partial<Profile>) => Promise<void>; onCancel: () => void }) {
  const [position, setPosition] = useState(profile.position ?? '')
  const [club, setClub] = useState(profile.club ?? '')
  const [status, setStatus] = useState(profile.status ?? 'open_to_offers')
  const [saving, setSaving] = useState(false)

  const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' as const }

  return (
    <div className="space-y-3">
      {/* Position — dropdown */}
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Position</label>
        <select
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          className="w-full rounded-lg px-4 py-2.5 text-sm outline-none appearance-none cursor-pointer"
          style={{ ...inputStyle, color: position ? '#e8dece' : '#8892aa' }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
        >
          <option value="" style={{ color: '#8892aa', backgroundColor: '#13172a' }}>Select position…</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p} style={{ color: '#e8dece', backgroundColor: '#13172a' }}>{p}</option>
          ))}
        </select>
      </div>

      {/* Club — free text */}
      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Club</label>
        <input
          value={club}
          onChange={(e) => setClub(e.target.value)}
          className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
          style={inputStyle}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
          placeholder="e.g. Harrogate Town"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Availability</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Profile['status'])}
          className="w-full rounded-lg px-4 py-2.5 text-sm outline-none appearance-none"
          style={{ ...inputStyle, color: STATUS_COLORS[status] ?? '#e8dece' }}
        >
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key} style={{ color: '#e8dece', backgroundColor: '#13172a' }}>{label}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full" style={{ border: '1px solid #1e2235', color: '#8892aa' }}>Cancel</button>
        <button
          onClick={async () => { setSaving(true); await onSave({ position, club, status }); setSaving(false) }}
          disabled={saving}
          className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full disabled:opacity-50"
          style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function HighlightsEditor({ urls, premium, onSave, onCancel }: { urls: string[]; premium: boolean; onSave: (urls: string[]) => Promise<void>; onCancel: () => void }) {
  const maxVideos = premium ? 5 : 1
  const [list, setList] = useState<string[]>(urls.length ? urls : [''])
  const [saving, setSaving] = useState(false)

  function updateUrl(i: number, val: string) {
    setList(l => l.map((u, idx) => idx === i ? val : u))
  }
  function addRow() {
    if (list.length < maxVideos) setList(l => [...l, ''])
  }
  function removeRow(i: number) {
    setList(l => l.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-3">
      {!premium && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(45,95,196,0.1)', color: '#60a5fa' }}>
          Free players can add 1 video. Upgrade to Pro for up to 5.
        </p>
      )}
      {list.map((url, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={url}
            onChange={(e) => updateUrl(i, e.target.value)}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm outline-none"
            style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
            placeholder="YouTube or Vimeo link"
          />
          {list.length > 1 && (
            <button onClick={() => removeRow(i)} className="text-xs px-2 rounded-lg" style={{ color: '#8892aa' }}>✕</button>
          )}
        </div>
      ))}
      {list.length < maxVideos && (
        <button onClick={addRow} className="text-xs uppercase tracking-wider" style={{ color: '#2d5fc4' }}>
          + Add another
        </button>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full" style={{ border: '1px solid #1e2235', color: '#8892aa' }}>Cancel</button>
        <button
          onClick={async () => { setSaving(true); await onSave(list.filter(Boolean)); setSaving(false) }}
          disabled={saving}
          className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full disabled:opacity-50"
          style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
