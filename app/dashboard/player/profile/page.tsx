'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { calcCompletion } from '@/lib/profileCompletion'
import Breadcrumb from '@/app/components/Breadcrumb'
import { useSidebar } from '@/app/dashboard/player/_components/SidebarContext'
import { POSITIONS } from '@/lib/positions'
import { LEVELS } from '@/lib/levels'

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  sms_opt_in: boolean
  date_of_birth: string | null
  city: string | null
  location: string | null
  position: string | null
  secondary_position: string | null
  club: string | null
  playing_level: string | null
  foot: string | null
  height: string | null
  status: string | null
  goals: number
  assists: number
  appearances: number
  season: string | null
  highlight_urls: string[]
  streak_weeks: number
  last_active: string | null
  premium: boolean
}


const STATUS_COLORS: Record<string, string> = {
  free_agent:    '#60a5fa',
  signed:        '#8892aa',
  loan_dual_reg: '#a78bfa',
  just_exploring:'#f59e0b',
}

// ─── Completion Score ─────────────────────────────────────────────────────────
// Delegated to lib/profileCompletion.ts — single source of truth

// ─── Reusable UI ──────────────────────────────────────────────────────────────

const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
      style={inputStyle}
      onFocus={e => { e.currentTarget.style.borderColor = '#2d5fc4'; props.onFocus?.(e) }}
      onBlur={e => { e.currentTarget.style.borderColor = '#1e2235'; props.onBlur?.(e) }} />
  )
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props}
      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none appearance-none"
      style={inputStyle}
      onFocus={e => { e.currentTarget.style.borderColor = '#2d5fc4'; props.onFocus?.(e) }}
      onBlur={e => { e.currentTarget.style.borderColor = '#1e2235'; props.onBlur?.(e) }}>
      {children}
    </select>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{children}</label>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label>{label}</Label>{children}</div>
}

function SectionCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: '1px solid #1e2235' }}>
        <h3 className="text-sm font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function EditButton({ editing, onEdit, onSave, saving }: { editing: boolean; onEdit: () => void; onSave: () => void; saving: boolean }) {
  if (!editing) {
    return (
      <button onClick={onEdit} className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors"
        style={{ border: '1px solid #1e2235', color: '#8892aa' }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2235')}>
        Edit
      </button>
    )
  }
  return (
    <div className="flex gap-2">
      <button onClick={onEdit} className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full"
        style={{ border: '1px solid #1e2235', color: '#8892aa' }}>
        Cancel
      </button>
      <button onClick={onSave} disabled={saving}
        className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full disabled:opacity-50"
        style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function ReadOnlyRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{label}</span>
      <span className="text-sm" style={{ color: value ? '#e8dece' : '#8892aa' }}>{value ?? '—'}</span>
    </div>
  )
}

// ─── Avatar Section ───────────────────────────────────────────────────────────

function AvatarSection({ profile, onUpdate }: { profile: Profile; onUpdate: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please select an image.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB.'); return }
    setError(null)
    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`
    const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadErr) { setError('Upload failed.'); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
    onUpdate(publicUrl)
    setUploading(false)
  }

  const initials = profile.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const statusColor = profile.status ? STATUS_COLORS[profile.status] : null

  return (
    <div className="flex flex-col items-center gap-4 py-6 px-4">
      {/* Avatar */}
      <div className="relative">
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className="w-24 h-24 rounded-full overflow-hidden relative group disabled:opacity-50 flex-shrink-0"
          style={{ border: `3px solid ${statusColor ?? '#1e2235'}` }}>
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl font-black"
              style={{ backgroundColor: '#1e2235', color: '#8892aa', fontFamily: "'Barlow Condensed', sans-serif" }}>
              {initials}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
            {uploading ? (
              <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
          </div>
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {/* Name + info */}
      <div className="text-center">
        <h2 className="text-2xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          {profile.full_name ?? 'Your Name'}
        </h2>
        <p className="text-sm mt-0.5" style={{ color: '#8892aa' }}>
          {[profile.position, profile.club].filter(Boolean).join(' · ') || 'Add your position and club'}
        </p>
        {profile.streak_weeks > 0 && (
          <p className="text-xs mt-1" style={{ color: '#8892aa' }}>🔥 {profile.streak_weeks}-week streak</p>
        )}
      </div>

      {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
      <p className="text-xs" style={{ color: '#8892aa' }}>Tap photo to change · Max 5MB</p>
    </div>
  )
}

// ─── Completion Bar ───────────────────────────────────────────────────────────

function CompletionBar({ profile }: { profile: Profile }) {
  const { pct, missing } = calcCompletion(profile)
  const barColor = pct < 40 ? '#f59e0b' : pct < 75 ? '#2d5fc4' : pct < 100 ? '#34d399' : '#a78bfa'

  if (pct === 100) {
    return (
      <div className="rounded-2xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'rgba(167,139,250,0.15)' }}>
            <span style={{ fontSize: 16 }}>✓</span>
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Profile Complete</p>
            <p className="text-xs" style={{ color: '#8892aa' }}>You're maximising your visibility to coaches</p>
          </div>
          <span className="ml-auto text-sm font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#a78bfa' }}>100%</span>
        </div>
      </div>
    )
  }

  const showMissing = missing.slice(0, 3)

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#e8dece' }}>
          Profile Completion
        </p>
        <span className="text-xs font-bold" style={{ color: barColor }}>{pct}%</span>
      </div>
      <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#1e2235' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      {showMissing.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {showMissing.map(label => (
            <span key={label} className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(232,222,206,0.06)', color: '#8892aa', border: '1px solid #1e2235' }}>
              + {label}
            </span>
          ))}
          {missing.length > 3 && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(232,222,206,0.06)', color: '#8892aa', border: '1px solid #1e2235' }}>
              +{missing.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Notifications Section ───────────────────────────────────────────────────

function NotificationsCard({ profile, onToggleSms }: {
  profile: Profile
  onToggleSms: (val: boolean) => Promise<void>
}) {
  const [smsOn, setSmsOn] = useState(profile.sms_opt_in)
  const [saving, setSaving] = useState(false)

  async function toggleSms() {
    if (!profile.phone || saving) return
    const next = !smsOn
    setSmsOn(next)
    setSaving(true)
    await onToggleSms(next)
    setSaving(false)
  }

  return (
    <SectionCard title="Notifications">
      <div className="space-y-0">
        {/* SMS */}
        <div className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid #1e2235' }}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: profile.phone ? '#e8dece' : '#3a4055' }}>SMS Notifications</p>
            <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
              {profile.phone ? 'Text alert when you receive a new message' : 'Add a phone number in Personal Details to enable'}
            </p>
          </div>
          {profile.phone ? (
            <button type="button" onClick={toggleSms} disabled={saving}
              className="relative w-10 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
              style={{ backgroundColor: smsOn ? '#2d5fc4' : '#1e2235' }}>
              <div className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                style={{ left: smsOn ? '22px' : '4px' }} />
            </button>
          ) : (
            <span className="text-xs px-2 py-1 rounded-lg flex-shrink-0" style={{ backgroundColor: '#1e2235', color: '#3a4055' }}>Off</span>
          )}
        </div>
        {/* Email */}
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>Email Notifications</p>
            <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>New messages and key account activity</p>
          </div>
          <span className="text-xs px-2 py-1 rounded-lg flex-shrink-0" style={{ backgroundColor: '#1e2235', color: '#8892aa' }}>Always On</span>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlayerProfilePage() {
  const { openSidebar } = useSidebar()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  // Section edit states
  const [editingPersonal, setEditingPersonal] = useState(false)
  const [editingFootball, setEditingFootball] = useState(false)
  const [editingStats, setEditingStats] = useState(false)
  const [editingHighlights, setEditingHighlights] = useState(false)
  const [saving, setSaving] = useState(false)

  // Personal fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [dob, setDob] = useState('')
  const [city, setCity] = useState('')
  const [location, setLocation] = useState('')

  // Football fields
  const [position, setPosition] = useState('')
  const [secondaryPosition, setSecondaryPosition] = useState('')
  const [club, setClub] = useState('')
  const [playingLevel, setPlayingLevel] = useState('')
  const [foot, setFoot] = useState('')
  const [height, setHeight] = useState('')
  const [status, setStatus] = useState('')

  // Stats fields
  const [goals, setGoals] = useState(0)
  const [assists, setAssists] = useState(0)
  const [appearances, setAppearances] = useState(0)
  const [season, setSeason] = useState('2024/25')

  // Highlights
  const [highlights, setHighlights] = useState<string[]>([''])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!data) return
      const p = { ...data, highlight_urls: data.highlight_urls ?? [] } as Profile
      setProfile(p)
      syncFields(p)
      setLoading(false)
    }
    load()
  }, [])

  function syncFields(p: Profile) {
    setFullName(p.full_name ?? '')
    setPhone(p.phone ?? '')
    setSmsOptIn(p.sms_opt_in ?? false)
    setDob(p.date_of_birth ?? '')
    setCity(p.city ?? '')
    setLocation(p.location ?? '')
    setPosition(p.position ?? '')
    setSecondaryPosition(p.secondary_position ?? '')
    setClub(p.club ?? '')
    setPlayingLevel(p.playing_level ?? '')
    setFoot(p.foot ?? '')
    setHeight(p.height ?? '')
    setStatus(p.status ?? '')
    setGoals(p.goals ?? 0)
    setAssists(p.assists ?? 0)
    setAppearances(p.appearances ?? 0)
    setSeason(p.season ?? '2024/25')
    setHighlights(p.highlight_urls?.length ? p.highlight_urls : [''])
  }

  function cancelSection(section: string) {
    if (profile) syncFields(profile)
    if (section === 'personal') setEditingPersonal(false)
    if (section === 'football') setEditingFootball(false)
    if (section === 'stats') setEditingStats(false)
    if (section === 'highlights') setEditingHighlights(false)
  }

  function closeSection(section: string) {
    if (section === 'personal') setEditingPersonal(false)
    if (section === 'football') setEditingFootball(false)
    if (section === 'stats') setEditingStats(false)
    if (section === 'highlights') setEditingHighlights(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function save(updates: Partial<Profile>, section: string) {
    if (!profile) return
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id)
    setSaving(false)
    if (error) {
      showToast('Save failed — try again')
      return
    }
    const merged = { ...profile, ...updates }
    setProfile(merged)
    syncFields(merged)
    closeSection(section)
    showToast('Saved ✓')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!profile) return null

  const urls = highlights.filter(u => u.trim())

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 px-5 py-2.5 rounded-full text-sm font-semibold shadow-lg"
          style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
          {toast}
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-3 px-4 pt-3">
        <button onClick={openSidebar} className="flex flex-col gap-1.5 flex-shrink-0" style={{ width: 20 }}>
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 14 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
        </button>
        <Breadcrumb crumbs={[{ label: 'Home', href: '/dashboard/player' }, { label: 'My Profile' }]} />
      </div>

      {/* Avatar + name hero */}
      <AvatarSection
        profile={profile}
        onUpdate={(url) => setProfile(p => p ? { ...p, avatar_url: url } : p)}
      />

      <div className="space-y-3 px-4 pb-6">

        {/* Completion — matches homepage bar logic */}
        <CompletionBar profile={profile} />

        {/* ── Personal Details ── */}
        <SectionCard
          title="Personal Details"
          action={
            <EditButton editing={editingPersonal} saving={saving}
              onEdit={() => setEditingPersonal(e => !e)}
              onSave={() => save({ full_name: fullName || null, phone: phone || null, date_of_birth: dob || null, city: city || null, location: location || null }, 'personal')} />
          }>
          {editingPersonal ? (
            <div className="space-y-3">
              <Field label="Full Name"><Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" /></Field>
              <Field label="Phone"><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+447700900000" /></Field>
              <Field label="Date of Birth"><Input type="date" value={dob} onChange={e => setDob(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nearest City"><Input value={city} onChange={e => setCity(e.target.value)} placeholder="Manchester" /></Field>
                <Field label="Town / Area"><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Salford" /></Field>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5 divide-y" style={{ borderColor: '#1e2235' }}>
              <ReadOnlyRow label="Name" value={profile.full_name} />
              <ReadOnlyRow label="Phone" value={profile.phone} />
              <ReadOnlyRow label="Date of Birth" value={profile.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString('en-GB') : null} />
              <ReadOnlyRow label="City" value={[profile.city, profile.location].filter(Boolean).join(', ') || null} />
            </div>
          )}
        </SectionCard>

        {/* ── Football Info ── */}
        <SectionCard
          title="Football Info"
          action={
            <EditButton editing={editingFootball} saving={saving}
              onEdit={() => setEditingFootball(e => !e)}
              onSave={() => save({ position: position || null, secondary_position: secondaryPosition || null, club: club || null, playing_level: playingLevel || null, foot: foot || null, height: height || null, status: status || null }, 'football')} />
          }>
          {editingFootball ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Primary Position">
                  <Select value={position} onChange={e => setPosition(e.target.value)}>
                    <option value="">Select…</option>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </Field>
                <Field label="Secondary Position">
                  <Select value={secondaryPosition} onChange={e => setSecondaryPosition(e.target.value)}>
                    <option value="">None</option>
                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="Current Club"><Input value={club} onChange={e => setClub(e.target.value)} placeholder="Club name or Free Agent" /></Field>
              <Field label="Playing Level">
                <Select value={playingLevel} onChange={e => setPlayingLevel(e.target.value)}>
                  <option value="">Select level…</option>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Strongest Foot">
                  <Select value={foot} onChange={e => setFoot(e.target.value)}>
                    <option value="">Select…</option>
                    <option value="Right">Right</option>
                    <option value="Left">Left</option>
                    <option value="Both">Both</option>
                  </Select>
                </Field>
                <Field label="Height"><Input value={height} onChange={e => setHeight(e.target.value)} placeholder="e.g. 5'11" /></Field>
              </div>
              <Field label="Availability Status">
                <Select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="free_agent">Free Agent</option>
                  <option value="signed">Signed to a club</option>
                  <option value="loan_dual_reg">Looking for Loan / Dual Reg</option>
                  <option value="just_exploring">Just Exploring</option>
                </Select>
              </Field>
            </div>
          ) : (
            <div className="space-y-0.5 divide-y" style={{ borderColor: '#1e2235' }}>
              <ReadOnlyRow label="Position" value={[profile.position, profile.secondary_position].filter(Boolean).join(' / ') || null} />
              <ReadOnlyRow label="Club" value={profile.club} />
              <ReadOnlyRow label="Level" value={profile.playing_level} />
              <ReadOnlyRow label="Foot" value={profile.foot} />
              <ReadOnlyRow label="Height" value={profile.height} />
              <ReadOnlyRow label="Status" value={profile.status ? { free_agent: 'Free Agent', signed: 'Signed to a club', loan_dual_reg: 'Looking for Loan / Dual Reg', just_exploring: 'Just Exploring' }[profile.status] ?? null : null} />
            </div>
          )}
        </SectionCard>

        {/* ── Season Stats ── */}
        <SectionCard
          title="Season Stats"
          action={
            <EditButton editing={editingStats} saving={saving}
              onEdit={() => setEditingStats(e => !e)}
              onSave={() => save({ goals, assists, appearances, season: season || null }, 'stats')} />
          }>
          {editingStats ? (
            <div className="space-y-3">
              <Field label="Season"><Input value={season} onChange={e => setSeason(e.target.value)} placeholder="2024/25" /></Field>
              <div className="grid grid-cols-3 gap-3">
                {[{ label: 'Goals', val: goals, set: setGoals }, { label: 'Assists', val: assists, set: setAssists }, { label: 'Apps', val: appearances, set: setAppearances }].map(f => (
                  <Field key={f.label} label={f.label}>
                    <Input type="number" min={0} value={f.val} onChange={e => f.set(parseInt(e.target.value) || 0)} />
                  </Field>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs mb-3" style={{ color: '#8892aa' }}>{profile.season ?? '2024/25'}</p>
              <div className="grid grid-cols-3 gap-3">
                {[{ label: 'Goals', val: profile.goals }, { label: 'Assists', val: profile.assists }, { label: 'Apps', val: profile.appearances }].map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                    <p className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{s.val ?? 0}</p>
                    <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── Highlight Videos ── */}
        <SectionCard
          title="Highlight Videos"
          action={
            <EditButton editing={editingHighlights} saving={saving}
              onEdit={() => setEditingHighlights(e => !e)}
              onSave={() => save({ highlight_urls: urls }, 'highlights')} />
          }>
          {editingHighlights ? (
            <div className="space-y-2">
              {highlights.map((url, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input type="url" value={url} onChange={e => { const next = [...highlights]; next[i] = e.target.value; setHighlights(next) }} placeholder="YouTube URL…" />
                  {highlights.length > 1 && (
                    <button onClick={() => setHighlights(highlights.filter((_, j) => j !== i))} style={{ color: '#f87171', flexShrink: 0 }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={() => setHighlights([...highlights, ''])}
                className="text-xs uppercase tracking-wider mt-1" style={{ color: '#2d5fc4' }}>
                + Add another
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {urls.length === 0 ? (
                <p className="text-sm" style={{ color: '#8892aa' }}>No highlights added yet — coaches love video.</p>
              ) : urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm truncate"
                  style={{ color: '#2d5fc4' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.5a8.27 8.27 0 0 0 4.84 1.55V6.6a4.85 4.85 0 0 1-1.07.09z" /></svg>
                  {url.replace('https://', '').slice(0, 40)}…
                </a>
              ))}
            </div>
          )}
        </SectionCard>

        {/* ── Notifications ── */}
        <div id="notifications">
          <NotificationsCard
            profile={profile}
            onToggleSms={async (val) => {
              await save({ sms_opt_in: val }, 'notifications')
            }}
          />
        </div>

        {/* ── Subscription ── */}
        {profile.premium && (
          <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <h3 className="text-base font-black uppercase tracking-wide"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Subscription
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#60a5fa', border: '1px solid rgba(45,95,196,0.3)' }}>
                Premium Active
              </span>
            </div>
            <p className="text-sm" style={{ color: '#8892aa' }}>
              Manage your billing, update your payment method, or cancel your subscription at any time.
            </p>
            <a
              href="https://billing.stripe.com/p/login/14A7sMbQgcuG0YRg2b2Ry00"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest"
              style={{ backgroundColor: '#0a0a0a', color: '#e8dece', border: '1px solid #1e2235', fontFamily: "'Barlow Condensed', sans-serif", textDecoration: 'none' }}
            >
              Manage Subscription
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
        )}

        {/* ── Account ── */}
        <SectionCard title="Account">
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Email</p>
              <p className="text-sm mt-0.5" style={{ color: '#e8dece' }}>{profile.email ?? '—'}</p>
            </div>
            <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(136,146,170,0.1)', color: '#8892aa' }}>
              Not editable
            </span>
          </div>
        </SectionCard>

      </div>
    </div>
  )
}
