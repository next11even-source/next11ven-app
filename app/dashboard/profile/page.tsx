'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import Breadcrumb from '@/app/components/Breadcrumb'

// ─── Types ────────────────────────────────────────────────────────────────────

type Profile = {
  id: string
  role: string | null
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  club: string | null
  city: string | null
  location: string | null
  premium: boolean
  streak_weeks: number
  streak_last_week: string | null
  last_active: string | null
  // Player fields
  position: string | null
  status: 'free_agent' | 'signed' | 'loan_dual_reg' | 'just_exploring' | null
  goals: number
  assists: number
  appearances: number
  season: string | null
  highlight_urls: string[]
  // Coach fields
  coaching_role: string | null
  coaching_level: string | null
  coaching_history: string | null
  // Contact
  phone: string | null
  sms_opt_in: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  free_agent:    'Free Agent',
  signed:        'Signed to a club',
  loan_dual_reg: 'Looking for Loan / Dual Reg',
  just_exploring:'Just Exploring',
}

const STATUS_COLORS: Record<string, string> = {
  free_agent:    '#60a5fa',
  signed:        '#8892aa',
  loan_dual_reg: '#a78bfa',
  just_exploring:'#f59e0b',
}

const PLAYER_POSITIONS = [
  'Goalkeeper','Right Back','Centre Back','Left Back',
  'Defensive Midfielder','Central Midfielder','Right Midfielder',
  'Left Midfielder','Attacking Midfielder','Right Winger',
  'Left Winger','Second Striker','Striker','Centre Forward',
]

const COACHING_ROLES = [
  'Head Coach / Manager','Assistant Manager','First Team Coach',
  'Goalkeeper Coach','U18s / Academy Coach','Fitness Coach',
  'Scout / Analyst','Player-Coach',
]

const COACHING_LEVELS = [
  'Premier League','Championship','League One','League Two',
  'National League','National League North/South','Step 3','Step 4',
  'Step 5','Step 6','Step 7 and below',
]

// ─── Utilities ────────────────────────────────────────────────────────────────

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
  return Date.now() - new Date(lastActive).getTime() < 7 * 24 * 60 * 60 * 1000
}

const iStyle = { backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' as const }

function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
      style={iStyle}
      onFocus={e => { e.currentTarget.style.borderColor = '#2d5fc4'; props.onFocus?.(e) }}
      onBlur={e => { e.currentTarget.style.borderColor = '#1e2235'; props.onBlur?.(e) }} />
  )
}

function Sel({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props}
      className="w-full rounded-lg px-4 py-2.5 text-sm outline-none appearance-none"
      style={iStyle}
      onFocus={e => { e.currentTarget.style.borderColor = '#2d5fc4'; props.onFocus?.(e) }}
      onBlur={e => { e.currentTarget.style.borderColor = '#1e2235'; props.onBlur?.(e) }}>
      {children}
    </select>
  )
}

function Lbl({ children }: { children: React.ReactNode }) {
  return <label className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{children}</label>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Lbl>{label}</Lbl>{children}</div>
}

function SaveCancel({ saving, onSave, onCancel }: { saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button onClick={onCancel} className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full"
        style={{ border: '1px solid #1e2235', color: '#8892aa' }}>Cancel</button>
      <button onClick={onSave} disabled={saving}
        className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full disabled:opacity-50"
        style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ─── Shared Components ────────────────────────────────────────────────────────

function AvatarUpload({ profile, onUploaded }: { profile: Profile; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB.'); return }
    setError(null)
    setUploading(true)
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) { setError('Upload failed.'); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id)
    onUploaded(publicUrl)
    setUploading(false)
  }

  const initials = profile.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <div className="flex-shrink-0 relative group">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
        className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden relative transition-opacity disabled:opacity-50"
        style={{ backgroundColor: '#1e2235' }} title="Upload photo">
        {profile.avatar_url
          ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          : <span className="text-xl font-bold" style={{ color: '#8892aa' }}>{initials}</span>}
        <span className="absolute inset-0 flex flex-col items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          {uploading
            ? <span className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />
            : <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg><span className="text-xs text-white mt-1">Upload</span></>}
        </span>
      </button>
      {error && <p className="absolute -bottom-5 left-0 text-xs whitespace-nowrap" style={{ color: '#f87171' }}>{error}</p>}
    </div>
  )
}

function EditableCard({ title, children, editContent }: {
  title: string; children: React.ReactNode; editContent: (cancel: () => void) => React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="rounded-xl p-5 space-y-3" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{title}</h3>
        {!editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2235')}>
            Edit
          </button>
        )}
      </div>
      {editing ? editContent(() => setEditing(false)) : children}
    </div>
  )
}

// ─── Player-specific sections ─────────────────────────────────────────────────

function PlayerDetailsCard({ profile, onSave }: { profile: Profile; onSave: (u: Partial<Profile>) => Promise<void> }) {
  return (
    <EditableCard title="Details" editContent={(cancel) => (
      <PlayerDetailsEditor profile={profile} onSave={async (u) => { await onSave(u); cancel() }} onCancel={cancel} />
    )}>
      <div className="space-y-2">
        {[
          { label: 'Position', value: profile.position },
          { label: 'Club', value: profile.club },
          { label: 'Availability', value: profile.status ? STATUS_LABELS[profile.status] : null, color: profile.status ? STATUS_COLORS[profile.status] : undefined },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{label}</span>
            <span className="text-sm font-medium" style={{ color: color ?? (value ? '#e8dece' : '#3a4055') }}>{value ?? 'Not set'}</span>
          </div>
        ))}
      </div>
    </EditableCard>
  )
}

function PlayerDetailsEditor({ profile, onSave, onCancel }: {
  profile: Profile; onSave: (u: Partial<Profile>) => Promise<void>; onCancel: () => void
}) {
  const [position, setPosition] = useState(profile.position ?? '')
  const [club, setClub] = useState(profile.club ?? '')
  const [city, setCity] = useState(profile.city ?? '')
  const [status, setStatus] = useState(profile.status ?? 'just_exploring')
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-3">
      <Field label="Position">
        <Sel value={position} onChange={e => setPosition(e.target.value)}>
          <option value="">Select position…</option>
          {PLAYER_POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </Sel>
      </Field>
      <Field label="Club"><Inp value={club} onChange={e => setClub(e.target.value)} placeholder="e.g. Harrogate Town" /></Field>
      <Field label="Nearest City"><Inp value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Manchester" /></Field>
      <Field label="Availability">
        <Sel value={status} onChange={e => setStatus(e.target.value as Exclude<Profile['status'], null>)}>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </Sel>
      </Field>
      <SaveCancel saving={saving} onCancel={onCancel}
        onSave={async () => { setSaving(true); await onSave({ position: position || null, club: club || null, city: city || null, status: status || null }); setSaving(false) }} />
    </div>
  )
}

function StatsCard({ profile, onSave }: { profile: Profile; onSave: (u: Partial<Profile>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [goals, setGoals] = useState(profile.goals ?? 0)
  const [assists, setAssists] = useState(profile.assists ?? 0)
  const [appearances, setAppearances] = useState(profile.appearances ?? 0)
  const [season, setSeason] = useState(profile.season ?? '2024/25')
  const [saving, setSaving] = useState(false)

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>Season Stats</h3>
          {!editing && <p className="text-xs" style={{ color: '#8892aa' }}>{season}</p>}
        </div>
        {!editing
          ? <button onClick={() => setEditing(true)}
              className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors"
              style={{ border: '1px solid #1e2235', color: '#8892aa' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2235')}>Update</button>
          : <div className="flex gap-2">
              <button onClick={() => setEditing(false)} className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full" style={{ border: '1px solid #1e2235', color: '#8892aa' }}>Cancel</button>
              <button onClick={async () => { setSaving(true); await onSave({ goals, assists, appearances, season }); setSaving(false); setEditing(false) }}
                disabled={saving} className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full disabled:opacity-50"
                style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>}
      </div>
      {editing ? (
        <div className="space-y-3">
          <Field label="Season"><Inp value={season} onChange={e => setSeason(e.target.value)} placeholder="2024/25" /></Field>
          <div className="grid grid-cols-3 gap-3">
            {[{ label: 'Goals', val: goals, set: setGoals }, { label: 'Assists', val: assists, set: setAssists }, { label: 'Apps', val: appearances, set: setAppearances }].map(f => (
              <div key={f.label} className="space-y-1">
                <Lbl>{f.label}</Lbl>
                <input type="number" min={0} value={f.val} onChange={e => f.set(Number(e.target.value))}
                  className="w-full rounded-lg px-3 py-2.5 text-sm text-center outline-none"
                  style={iStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {[{ label: 'Goals', val: profile.goals ?? 0 }, { label: 'Assists', val: profile.assists ?? 0 }, { label: 'Apps', val: profile.appearances ?? 0 }].map(s => (
            <div key={s.label} className="rounded-lg p-3 text-center" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
              <p className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{s.val}</p>
              <p className="text-xs uppercase tracking-wider mt-0.5" style={{ color: '#8892aa' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HighlightsCard({ profile, onSave }: { profile: Profile; onSave: (u: Partial<Profile>) => Promise<void> }) {
  return (
    <EditableCard title="Highlight Videos" editContent={(cancel) => (
      <HighlightsEditor urls={profile.highlight_urls} premium={profile.premium}
        onSave={async (urls) => { await onSave({ highlight_urls: urls }); cancel() }} onCancel={cancel} />
    )}>
      {profile.highlight_urls?.length > 0
        ? <div className="space-y-2">
            {profile.highlight_urls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm" style={{ color: '#2d5fc4' }}>
                <span>▶</span><span className="truncate">{url}</span>
              </a>
            ))}
          </div>
        : <p className="text-sm italic" style={{ color: '#3a4055' }}>No highlights added yet.</p>}
    </EditableCard>
  )
}

function HighlightsEditor({ urls, premium, onSave, onCancel }: { urls: string[]; premium: boolean; onSave: (urls: string[]) => Promise<void>; onCancel: () => void }) {
  const maxVideos = premium ? 5 : 1
  const [list, setList] = useState<string[]>(urls.length ? urls : [''])
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-3">
      {!premium && <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(45,95,196,0.1)', color: '#60a5fa' }}>Free players can add 1 video. Upgrade to Pro for up to 5.</p>}
      {list.map((url, i) => (
        <div key={i} className="flex gap-2">
          <Inp type="url" value={url} onChange={e => setList(l => l.map((u, idx) => idx === i ? e.target.value : u))} placeholder="YouTube or Vimeo link" />
          {list.length > 1 && <button onClick={() => setList(l => l.filter((_, idx) => idx !== i))} className="text-xs px-2 rounded-lg" style={{ color: '#8892aa' }}>✕</button>}
        </div>
      ))}
      {list.length < maxVideos && <button onClick={() => setList(l => [...l, ''])} className="text-xs uppercase tracking-wider" style={{ color: '#2d5fc4' }}>+ Add another</button>}
      <SaveCancel saving={saving} onCancel={onCancel}
        onSave={async () => { setSaving(true); await onSave(list.filter(Boolean)); setSaving(false) }} />
    </div>
  )
}

// ─── Coach-specific sections ──────────────────────────────────────────────────

function CoachDetailsCard({ profile, onSave }: { profile: Profile; onSave: (u: Partial<Profile>) => Promise<void> }) {
  return (
    <EditableCard title="Coaching Info" editContent={(cancel) => (
      <CoachDetailsEditor profile={profile} onSave={async (u) => { await onSave(u); cancel() }} onCancel={cancel} />
    )}>
      <div className="space-y-2">
        {[
          { label: 'Coaching Role', value: profile.coaching_role },
          { label: 'Level', value: profile.coaching_level },
          { label: 'Club / Organisation', value: profile.club },
          { label: 'City', value: profile.city },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{label}</span>
            <span className="text-sm font-medium" style={{ color: value ? '#e8dece' : '#3a4055' }}>{value ?? 'Not set'}</span>
          </div>
        ))}
      </div>
    </EditableCard>
  )
}

function CoachDetailsEditor({ profile, onSave, onCancel }: {
  profile: Profile; onSave: (u: Partial<Profile>) => Promise<void>; onCancel: () => void
}) {
  const [coachingRole, setCoachingRole] = useState(profile.coaching_role ?? '')
  const [coachingLevel, setCoachingLevel] = useState(profile.coaching_level ?? '')
  const [club, setClub] = useState(profile.club ?? '')
  const [city, setCity] = useState(profile.city ?? '')
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-3">
      <Field label="Coaching Role">
        <Sel value={coachingRole} onChange={e => setCoachingRole(e.target.value)}>
          <option value="">Select role…</option>
          {COACHING_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </Sel>
      </Field>
      <Field label="Level">
        <Sel value={coachingLevel} onChange={e => setCoachingLevel(e.target.value)}>
          <option value="">Select level…</option>
          {COACHING_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </Sel>
      </Field>
      <Field label="Club / Organisation">
        <Inp value={club} onChange={e => setClub(e.target.value)} placeholder="e.g. Salford City" />
      </Field>
      <Field label="City / Area">
        <Inp value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Manchester" />
      </Field>
      <SaveCancel saving={saving} onCancel={onCancel}
        onSave={async () => {
          setSaving(true)
          await onSave({ coaching_role: coachingRole || null, coaching_level: coachingLevel || null, club: club || null, city: city || null })
          setSaving(false)
        }} />
    </div>
  )
}

function CoachingHistoryCard({ profile, onSave }: { profile: Profile; onSave: (u: Partial<Profile>) => Promise<void> }) {
  return (
    <EditableCard title="Coaching History" editContent={(cancel) => (
      <CoachingHistoryEditor profile={profile} onSave={async (u) => { await onSave(u); cancel() }} onCancel={cancel} />
    )}>
      {profile.coaching_history
        ? <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#8892aa' }}>{profile.coaching_history}</p>
        : <p className="text-sm italic" style={{ color: '#3a4055' }}>Add your coaching background — clubs managed, achievements, UEFA badges, etc.</p>}
    </EditableCard>
  )
}

function CoachingHistoryEditor({ profile, onSave, onCancel }: {
  profile: Profile; onSave: (u: Partial<Profile>) => Promise<void>; onCancel: () => void
}) {
  const [history, setHistory] = useState(profile.coaching_history ?? '')
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-3">
      <textarea value={history} onChange={e => setHistory(e.target.value)} rows={5}
        className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-none"
        style={iStyle}
        onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
        onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
        placeholder="e.g. AFC Wimbledon U18s (2021–23), Sutton United First Team Coach (2023–present). UEFA B licence holder." />
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: '#8892aa' }}>{history.length} chars</span>
        <SaveCancel saving={saving} onCancel={onCancel}
          onSave={async () => { setSaving(true); await onSave({ coaching_history: history || null }); setSaving(false) }} />
      </div>
    </div>
  )
}

// ─── Coach Contact (phone only) ───────────────────────────────────────────────

function CoachContactCard({ profile, onSave }: { profile: Profile; onSave: (u: Partial<Profile>) => Promise<void> }) {
  return (
    <EditableCard title="Contact" editContent={(cancel) => (
      <CoachContactEditor profile={profile} onSave={async (u) => { await onSave(u); cancel() }} onCancel={cancel} />
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Phone</span>
        <span className="text-sm font-medium" style={{ color: profile.phone ? '#e8dece' : '#3a4055' }}>{profile.phone ?? 'Not set'}</span>
      </div>
    </EditableCard>
  )
}

function CoachContactEditor({ profile, onSave, onCancel }: {
  profile: Profile; onSave: (u: Partial<Profile>) => Promise<void>; onCancel: () => void
}) {
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-3">
      <Field label="Phone">
        <Inp type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+447700900000" />
      </Field>
      <SaveCancel saving={saving} onCancel={onCancel}
        onSave={async () => {
          setSaving(true)
          await onSave({ phone: phone || null })
          setSaving(false)
        }} />
    </div>
  )
}

// ─── Notifications (shared, instant-save toggles) ─────────────────────────────

function NotificationsCard({ profile, onSave }: { profile: Profile; onSave: (u: Partial<Profile>) => Promise<void> }) {
  const [smsOn, setSmsOn] = useState(profile.sms_opt_in ?? false)
  const [saving, setSaving] = useState(false)

  async function toggleSms() {
    if (!profile.phone || saving) return
    const next = !smsOn
    setSmsOn(next)
    setSaving(true)
    await onSave({ sms_opt_in: next })
    setSaving(false)
  }

  return (
    <div className="rounded-xl p-5 space-y-0" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <h3 className="text-sm font-bold uppercase mb-3"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>Notifications</h3>
      {/* SMS */}
      <div className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid #1e2235' }}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: profile.phone ? '#e8dece' : '#3a4055' }}>SMS Notifications</p>
          <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
            {profile.phone ? 'Text alert when you receive a new message' : 'Add a phone number in Contact above to enable'}
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
  )
}

// ─── Bio (shared) ─────────────────────────────────────────────────────────────

function BioCard({ profile, isCoach, onSave }: { profile: Profile; isCoach: boolean; onSave: (u: Partial<Profile>) => Promise<void> }) {
  return (
    <EditableCard title="About" editContent={(cancel) => (
      <BioEditor profile={profile} isCoach={isCoach} onSave={async (bio) => { await onSave({ bio }); cancel() }} onCancel={cancel} />
    )}>
      {profile.bio
        ? <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>{profile.bio}</p>
        : <p className="text-sm italic" style={{ color: '#3a4055' }}>
            {isCoach ? 'Add a bio — tell players about your coaching philosophy and what you look for.' : 'No bio yet — tell coaches about yourself.'}
          </p>}
    </EditableCard>
  )
}

function BioEditor({ profile, isCoach, onSave, onCancel }: {
  profile: Profile; isCoach: boolean; onSave: (bio: string) => Promise<void>; onCancel: () => void
}) {
  const [bio, setBio] = useState(profile.bio ?? '')
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-3">
      <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4} maxLength={300}
        className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-none"
        style={iStyle}
        onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
        onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
        placeholder={isCoach
          ? 'Describe your coaching philosophy, what you look for in players, and your background…'
          : 'Tell coaches about your playing style, experience, and what you\'re looking for…'} />
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: '#8892aa' }}>{bio.length}/300</span>
        <SaveCancel saving={saving} onCancel={onCancel}
          onSave={async () => { setSaving(true); await onSave(bio); setSaving(false) }} />
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!data) return
      await supabase.from('profiles').update({ last_active: new Date().toISOString() }).eq('id', user.id)
      setProfile({ ...data, highlight_urls: data.highlight_urls ?? [] })
    }
    load()
  }, [])

  async function saveProfile(updates: Partial<Profile>) {
    if (!profile) return
    const supabase = createClient()
    const { streak, lastWeek } = calcStreak(profile.streak_weeks, profile.streak_last_week)
    const payload = { ...updates, streak_weeks: streak, streak_last_week: lastWeek, last_active: new Date().toISOString() }
    await supabase.from('profiles').update(payload).eq('id', profile.id)
    setProfile(p => p ? { ...p, ...payload } : p)
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

  const isCoach = profile.role === 'coach'
  const active = isActiveThisWeek(profile.last_active)
  const homeHref = isCoach ? '/dashboard/coach' : '/dashboard/player'
  const subtitle = isCoach
    ? [profile.coaching_role, profile.club].filter(Boolean).join(' · ') || 'Add your role and club'
    : [profile.position, profile.club].filter(Boolean).join(' · ') || 'Add your position and club'

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Nav */}
      <header className="sticky top-0 z-10 px-4 py-2"
        style={{ backgroundColor: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[{ label: 'Home', href: homeHref }, { label: 'My Profile' }]} />
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">

        {/* Hero Card */}
        <div className="rounded-xl p-6" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div className="flex items-start gap-4">
            <AvatarUpload profile={profile} onUploaded={(url) => setProfile(p => p ? { ...p, avatar_url: url } : p)} />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold uppercase"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                  {profile.full_name ?? 'Your Name'}
                </h1>
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: active ? 'rgba(74,222,128,0.1)' : 'rgba(136,146,170,0.1)', color: active ? '#4ade80' : '#8892aa' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? '#4ade80' : '#8892aa' }} />
                  {active ? 'Active this week' : 'Inactive'}
                </span>
              </div>
              <p className="text-sm" style={{ color: '#8892aa' }}>{subtitle}</p>
              {!isCoach && profile.streak_weeks > 0 && (
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-base">🔥</span>
                  <span className="text-xs font-semibold" style={{ color: '#e8dece' }}>{profile.streak_weeks}-week streak</span>
                  <span className="text-xs" style={{ color: '#8892aa' }}>— keep it going</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bio (shared) */}
        <BioCard profile={profile} isCoach={isCoach} onSave={saveProfile} />

        {/* Role-specific sections */}
        {isCoach ? (
          <>
            <CoachDetailsCard profile={profile} onSave={saveProfile} />
            <CoachingHistoryCard profile={profile} onSave={saveProfile} />
            <CoachContactCard profile={profile} onSave={saveProfile} />
            <div id="notifications">
              <NotificationsCard profile={profile} onSave={saveProfile} />
            </div>
          </>
        ) : (
          <>
            <PlayerDetailsCard profile={profile} onSave={saveProfile} />
            <StatsCard profile={profile} onSave={saveProfile} />
            <HighlightsCard profile={profile} onSave={saveProfile} />
            <div id="notifications">
              <NotificationsCard profile={profile} onSave={saveProfile} />
            </div>
          </>
        )}

      </main>
    </div>
  )
}
