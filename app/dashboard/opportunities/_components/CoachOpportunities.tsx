'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useSidebar } from '@/app/dashboard/player/_components/SidebarContext'
import { POSITIONS } from '@/lib/positions'
import { LEVELS } from '@/lib/levels'
import { LevelBadge, ClubCrest } from '@/app/components/OpportunityBadges'

// ─── Types ────────────────────────────────────────────────────────────────────

type Opp = {
  id: string
  coach_id: string
  title: string
  club: string | null
  location: string | null
  position: string | null
  level: string | null
  description: string | null
  urgent: boolean
  deadline: string | null
  is_active: boolean
  opportunity_type: string | null
  created_at: string
  isOwn: boolean
  application_count: number
}

type Applicant = {
  id: string
  message: string | null
  status: string
  created_at: string
  player: {
    id: string
    full_name: string | null
    position: string | null
    club: string | null
    avatar_url: string | null
    city: string | null
    playing_level: string | null
    status: string | null
  }
}

const COACHING_ROLES = [
  'Head Coach / Manager','Assistant Manager','First Team Coach',
  'Goalkeeping Coach','U18s / Academy Coach','Fitness & Conditioning Coach',
  'Scout / Analyst','Player-Coach',
]

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  pending:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  label: 'Pending' },
  viewed:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  label: 'Viewed' },
  shortlisted: { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', label: 'Shortlisted' },
  accepted:    { color: '#2d5fc4', bg: 'rgba(45,95,196,0.15)',  label: 'Accepted' },
  rejected:    { color: '#8892aa', bg: 'rgba(136,146,170,0.1)', label: 'Not Progressed' },
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function daysUntilDeadline(deadline: string) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
}

function Chip({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color, backgroundColor: bg }}>
      {children}
    </span>
  )
}

function Avatar({ name, url, size = 40 }: { name: string | null; url: string | null; size?: number }) {
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  if (url) return <img src={url} alt={name ?? ''} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs"
      style={{ width: size, height: size, backgroundColor: '#1e2235', color: '#8892aa' }}>
      {initials}
    </div>
  )
}

const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}
        dangerouslySetInnerHTML={{ __html: label }} />
      {children}
    </div>
  )
}

// ─── Post Form ────────────────────────────────────────────────────────────────

function PostOpportunityForm({ onPosted, onCancel }: {
  onPosted: (opp: Opp) => void
  onCancel: () => void
}) {
  const [opportunityType, setOpportunityType] = useState<'player' | 'coach'>('player')
  const [title, setTitle] = useState('')
  const [club, setClub] = useState('')
  const [location, setLocation] = useState('')
  const [position, setPosition] = useState('')
  const [level, setLevel] = useState('')
  const [description, setDescription] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [deadline, setDeadline] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required.'); return }
    if (!level) { setError('Club level is required — select the level your club plays at.'); return }
    setSaving(true)
    setError(null)

    const res = await fetch('/api/opportunities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        club: club || null,
        location: location || null,
        position: position || null,
        level: level || null,
        description: description || null,
        urgent,
        deadline: deadline || null,
        opportunity_type: opportunityType,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to post opportunity'); setSaving(false); return }
    onPosted(data as Opp)
  }

  return (
    <div className="rounded-xl p-6 space-y-5" style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Post an Opportunity
        </h3>
        <button onClick={onCancel} className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Cancel</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {(['player', 'coach'] as const).map(t => (
            <button key={t} type="button" onClick={() => { setOpportunityType(t); setPosition('') }}
              className="py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{
                backgroundColor: opportunityType === t ? '#2d5fc4' : '#0a0a0a',
                color: opportunityType === t ? '#fff' : '#8892aa',
                border: `1px solid ${opportunityType === t ? '#2d5fc4' : '#1e2235'}`,
              }}>
              {t === 'player' ? '⚽ Player Role' : '🧑‍💼 Coaching Staff'}
            </button>
          ))}
        </div>

        <Field label="Opportunity Title *">
          <input value={title} onChange={e => setTitle(e.target.value)} required
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none" style={inputStyle}
            onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
            placeholder={opportunityType === 'coach' ? 'e.g. Seeking an Assistant Manager' : 'e.g. Seeking a Centre Back for pre-season'} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Club Name (premium players only)">
            <input value={club} onChange={e => setClub(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none" style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
              placeholder="e.g. Abbey Hey FC" />
          </Field>
          <Field label="Area (shown to all)">
            <input value={location} onChange={e => setLocation(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none" style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
              placeholder="e.g. Manchester" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={opportunityType === 'coach' ? 'Coaching Role' : 'Position'}>
            <select value={position} onChange={e => setPosition(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none" style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}>
              <option value="">{opportunityType === 'coach' ? 'Select role' : 'Any position'}</option>
              {(opportunityType === 'coach' ? COACHING_ROLES : POSITIONS).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Club Level *">
            <select value={level} onChange={e => setLevel(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none" style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}>
              <option value="">What level does your club play at?</option>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
            className="w-full rounded-lg px-4 py-2.5 text-sm outline-none resize-none" style={inputStyle}
            onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
            placeholder="Tell players what you're looking for, training times, any requirements…" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Application Deadline">
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none" style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')} />
          </Field>
          <Field label="&nbsp;">
            <label className="flex items-center gap-3 rounded-lg px-4 py-2.5 cursor-pointer h-full"
              style={{ backgroundColor: '#0a0a0a', border: `1px solid ${urgent ? '#f59e0b' : '#1e2235'}` }}>
              <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="accent-amber-500" />
              <span className="text-sm" style={{ color: urgent ? '#f59e0b' : '#8892aa' }}>Mark as Urgent</span>
            </label>
          </Field>
        </div>

        {error && <p className="text-sm px-4 py-3 rounded-lg" style={{ color: '#f87171', backgroundColor: 'rgba(248,113,113,0.08)' }}>{error}</p>}

        <button type="submit" disabled={saving}
          className="w-full rounded-full py-3 text-sm font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
          style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
          onMouseEnter={e => !saving && (e.currentTarget.style.backgroundColor = '#3a6fda')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2d5fc4')}>
          {saving ? 'Posting…' : 'Post Opportunity'}
        </button>
      </form>
    </div>
  )
}

// ─── Applicants Panel ─────────────────────────────────────────────────────────

function ApplicantsPanel({ opportunity, onClose }: { opportunity: Opp; onClose: () => void }) {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [acceptMsg, setAcceptMsg] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('applications')
        .select(`
          id, message, status, created_at,
          player:player_id (id, full_name, position, club, avatar_url, city, playing_level, status)
        `)
        .eq('opportunity_id', opportunity.id)
        .order('created_at', { ascending: false })
      setApplicants((data as unknown as Applicant[]) ?? [])
      setLoading(false)
    }
    load()
  }, [opportunity.id])

  async function updateStatus(applicationId: string, status: string) {
    setActioning(applicationId)
    const res = await fetch(`/api/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setApplicants(prev => prev.map(a => a.id === applicationId ? { ...a, status } : a))
    }
    setActioning(null)
  }

  async function handleAcceptAndMessage(applicant: Applicant) {
    setActioning(applicant.id)
    const content = `Your application for ${opportunity.title} has been accepted.${acceptMsg.trim() ? ' ' + acceptMsg.trim() : ''}`
    await fetch(`/api/applications/${applicant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    })
    await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: applicant.player.id, content }),
    })
    setApplicants(prev => prev.map(a => a.id === applicant.id ? { ...a, status: 'accepted' } : a))
    setAcceptingId(null)
    setAcceptMsg('')
    setActioning(null)
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2d5fc4', backgroundColor: '#0d1020' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #1e2235' }}>
        <div>
          <h3 className="text-sm font-bold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Applicants — {opportunity.title}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
            {loading ? '…' : `${applicants.length} application${applicants.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={onClose} className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Close</button>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin mx-auto"
            style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
        </div>
      ) : applicants.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm" style={{ color: '#8892aa' }}>No applications yet.</p>
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: '#1e2235' }}>
          {applicants.map(a => (
            <div key={a.id} className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Avatar name={a.player?.full_name} url={a.player?.avatar_url} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>{a.player?.full_name ?? 'Player'}</p>
                    <span className="text-xs" style={{ color: '#8892aa' }}>{timeAgo(a.created_at)}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                    {[a.player?.position, a.player?.city].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {a.player?.playing_level && (
                    <p className="text-xs" style={{ color: '#8892aa' }}>{a.player.playing_level}</p>
                  )}
                  {a.message && (
                    <p className="text-xs mt-2 italic" style={{ color: '#8892aa' }}>"{a.message}"</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {(() => {
                    const cfg = STATUS_COLORS[a.status] ?? STATUS_COLORS.pending
                    return (
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                        style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }}>
                        {cfg.label}
                      </span>
                    )
                  })()}

                  <div className="flex items-center gap-2">
                    {a.status !== 'accepted' && acceptingId !== a.id && (
                      <button
                        onClick={() => { setAcceptingId(a.id); setAcceptMsg('') }}
                        disabled={actioning === a.id}
                        className="text-xs px-3 py-1.5 rounded-full font-semibold uppercase tracking-wider transition-all disabled:opacity-50"
                        style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4', border: '1px solid rgba(45,95,196,0.4)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(45,95,196,0.3)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(45,95,196,0.15)')}>
                        ✓ Accept &amp; Message
                      </button>
                    )}
                    {a.status !== 'rejected' && acceptingId !== a.id && (
                      <button
                        onClick={() => updateStatus(a.id, 'rejected')}
                        disabled={actioning === a.id}
                        className="text-xs px-3 py-1.5 rounded-full font-semibold uppercase tracking-wider transition-all disabled:opacity-50"
                        style={{ backgroundColor: 'transparent', color: '#8892aa', border: '1px solid #1e2235' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#8892aa')}>
                        {actioning === a.id ? '…' : '✕ Reject'}
                      </button>
                    )}
                    {(a.status === 'accepted' || a.status === 'rejected') && acceptingId !== a.id && (
                      <button
                        onClick={() => updateStatus(a.id, 'pending')}
                        disabled={actioning === a.id}
                        className="text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
                        style={{ color: '#3a4055' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#8892aa')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#3a4055')}>
                        Undo
                      </button>
                    )}
                  </div>
                </div>

                {acceptingId === a.id && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs" style={{ color: '#8892aa' }}>
                      Player will receive: <span style={{ color: '#e8dece' }}>"Your application for {opportunity.title} has been accepted."</span> + your message below.
                    </p>
                    <textarea
                      value={acceptMsg}
                      onChange={e => setAcceptMsg(e.target.value)}
                      rows={3}
                      autoFocus
                      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
                      style={{ backgroundColor: '#0a0a0a', border: '1px solid #2d5fc4', color: '#e8dece' }}
                      placeholder="Add a message — training times, next steps, contact info…"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setAcceptingId(null); setAcceptMsg('') }}
                        className="flex-1 rounded-full py-2 text-xs font-semibold uppercase tracking-wider"
                        style={{ border: '1px solid #1e2235', color: '#8892aa' }}>
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAcceptAndMessage(a)}
                        disabled={actioning === a.id}
                        className="flex-1 rounded-full py-2 text-xs font-semibold uppercase tracking-wider disabled:opacity-50"
                        style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                        {actioning === a.id ? 'Sending…' : 'Accept & Send Message'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const FREE_TIER_LIMIT = 2

export default function CoachOpportunities({ coachId }: { coachId: string }) {
  const { openSidebar } = useSidebar()
  const [isPremium, setIsPremium] = useState(false)
  const [monthlyCount, setMonthlyCount] = useState(0)
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [viewingApplicants, setViewingApplicants] = useState<Opp | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | 'mine'>('all')
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [urgentOnly, setUrgentOnly] = useState(false)
  // Coach applications to other clubs' coaching-staff roles
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState<string | null>(null)
  const [applyMessage, setApplyMessage] = useState('')
  const applicantsRef = useRef<HTMLDivElement>(null)

  // Scroll the applicants panel into view when it opens (it renders at the top
  // of the list, so on a long page a tap lower down looked like nothing happened).
  useEffect(() => {
    if (viewingApplicants) applicantsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [viewingApplicants])

  // Deep-link from the homepage "Post an Opportunity" button (?new=1) opens the form
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('new') === '1') {
      setActiveTab('mine')
      setShowForm(true)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const [profileRes, ownRes, othersRes, monthlyRes, appsRes] = await Promise.all([
        supabase.from('profiles').select('premium').eq('id', coachId).single(),
        supabase.from('opportunities').select('id, coach_id, title, club, location, position, level, description, urgent, deadline, is_active, opportunity_type, created_at').eq('coach_id', coachId).order('created_at', { ascending: false }),
        supabase.from('opportunities').select('id, coach_id, title, club, location, position, level, description, urgent, deadline, is_active, opportunity_type, created_at').neq('coach_id', coachId).eq('is_active', true).order('created_at', { ascending: false }).limit(50),
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).gte('created_at', startOfMonth.toISOString()),
        supabase.from('applications').select('opportunity_id').eq('player_id', coachId),
      ])

      setIsPremium(profileRes.data?.premium ?? false)
      setMonthlyCount(monthlyRes.count ?? 0)
      setAppliedIds(new Set((appsRes.data ?? []).map((a: { opportunity_id: string }) => a.opportunity_id)))

      const own = (ownRes.data ?? []) as Omit<Opp, 'isOwn' | 'application_count'>[]
      const others = (othersRes.data ?? []) as Omit<Opp, 'isOwn' | 'application_count'>[]

      // Application counts for the coach's own roles
      const counts = await Promise.all(
        own.map(async (o) => {
          const { count } = await supabase
            .from('applications')
            .select('*', { count: 'exact', head: true })
            .eq('opportunity_id', o.id)
          return { id: o.id, count: count ?? 0 }
        })
      )
      const countMap = Object.fromEntries(counts.map(c => [c.id, c.count]))

      const merged: Opp[] = [
        ...own.map(o => ({ ...o, isOwn: true, application_count: countMap[o.id] ?? 0 })),
        ...others.map(o => ({ ...o, isOwn: false, application_count: 0 })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setOpps(merged)
      setLoading(false)
    }
    load()
  }, [coachId])

  function handlePosted(opp: Opp) {
    setOpps(prev => [{ ...opp, isOwn: true, application_count: 0, is_active: true }, ...prev])
    setMonthlyCount(prev => prev + 1)
    setShowForm(false)
  }

  async function toggleActive(opp: Opp) {
    const supabase = createClient()
    await supabase.from('opportunities').update({ is_active: !opp.is_active }).eq('id', opp.id)
    setOpps(prev => prev.map(o => o.id === opp.id ? { ...o, is_active: !o.is_active } : o))
  }

  async function deleteOpp(id: string) {
    const supabase = createClient()
    await supabase.from('opportunities').delete().eq('id', id)
    setOpps(prev => prev.filter(o => o.id !== id))
    if (viewingApplicants?.id === id) setViewingApplicants(null)
  }

  async function handleApply(opp: Opp) {
    const res = await fetch('/api/applications/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity_id: opp.id, message: applyMessage.trim() || null }),
    })
    if (res.ok) {
      setAppliedIds(prev => new Set([...prev, opp.id]))
      setApplying(null)
      setApplyMessage('')
    }
  }

  const canPost = isPremium || monthlyCount < FREE_TIER_LIMIT
  const ownOpps = opps.filter(o => o.isOwn)
  const totalApplicants = ownOpps.reduce((sum, o) => sum + o.application_count, 0)
  const tabbed = activeTab === 'mine' ? ownOpps : opps

  // Filter options derived from the current tab's roles
  const levelOptions = Array.from(new Set(tabbed.map(o => o.level).filter(Boolean) as string[]))
  const positionOptions = Array.from(new Set(tabbed.map(o => o.position).filter(Boolean) as string[]))

  const q = search.trim().toLowerCase()
  const displayed = tabbed.filter(o => {
    if (levelFilter && o.level !== levelFilter) return false
    if (positionFilter && o.position !== positionFilter) return false
    if (urgentOnly && !o.urgent) return false
    if (q) {
      const hay = [o.title, o.club, o.location, o.position, o.level, o.description].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const hasActiveFilters = !!(q || levelFilter || positionFilter || urgentOnly)
  const selectStyle = { backgroundColor: '#0d1020', border: '1px solid #1e2235', color: '#e8dece' }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-0"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={openSidebar} className="flex flex-col gap-1.5" style={{ width: 20 }}>
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 14 }} />
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
          </button>
          <h1 className="text-base font-black uppercase tracking-widest"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Opportunities
          </h1>
          <div style={{ width: 20 }} />
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 pb-3">
          {([
            { key: 'all',  label: 'All Roles' },
            { key: 'mine', label: 'Your Roles' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => { setActiveTab(t.key); setShowForm(false) }}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
              style={{
                backgroundColor: activeTab === t.key ? '#2d5fc4' : 'transparent',
                color: activeTab === t.key ? '#fff' : '#8892aa',
                border: activeTab === t.key ? 'none' : '1px solid #1e2235',
              }}>
              {t.label}
              {t.key === 'mine' && totalApplicants > 0 && (
                <span className="min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold"
                  style={{ backgroundColor: activeTab === 'mine' ? '#fff' : '#2d5fc4', color: activeTab === 'mine' ? '#2d5fc4' : '#fff', fontSize: 10 }}>
                  {totalApplicants > 9 ? '9+' : totalApplicants}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Add Opportunity */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm" style={{ color: '#8892aa' }}>
            {activeTab === 'mine'
              ? 'Your posted roles — tap a role to view and manage applicants.'
              : 'Roles across the platform — post your own and manage applications.'}
          </p>
          {!showForm && (
            canPost ? (
              <button onClick={() => setShowForm(true)}
                className="flex-shrink-0 text-sm font-semibold uppercase tracking-wider px-5 py-2.5 rounded-full transition-colors"
                style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3a6fda')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2d5fc4')}>
                + Add Opportunity
              </button>
            ) : (
              <a href="/dashboard/coach/premium"
                className="flex-shrink-0 inline-block text-sm font-semibold uppercase tracking-wider px-5 py-2.5 rounded-full"
                style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', color: '#2d5fc4', textDecoration: 'none' }}>
                🔒 Coach Pro for Unlimited
              </a>
            )
          )}
        </div>

        {!showForm && !canPost && (
          <p className="text-xs" style={{ color: '#8892aa' }}>
            Monthly limit reached ({FREE_TIER_LIMIT}/{FREE_TIER_LIMIT}). Upgrade to Coach Pro to post unlimited roles.
          </p>
        )}

        {showForm && (
          <PostOpportunityForm onPosted={handlePosted} onCancel={() => setShowForm(false)} />
        )}

        {viewingApplicants && (
          <div ref={applicantsRef} style={{ scrollMarginTop: 80 }}>
            <ApplicantsPanel opportunity={viewingApplicants} onClose={() => setViewingApplicants(null)} />
          </div>
        )}

        {/* Filter bar */}
        {!loading && tabbed.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1" style={{ minWidth: 180 }}>
              <svg className="absolute top-1/2 -translate-y-1/2" style={{ left: 12 }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search roles, clubs, areas…"
                className="w-full rounded-full py-2 text-sm outline-none"
                style={{ ...selectStyle, paddingLeft: 34, paddingRight: 12 }}
                onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
                onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')} />
            </div>
            <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
              className="rounded-full px-3 py-2 text-sm outline-none cursor-pointer" style={selectStyle}>
              <option value="">All levels</option>
              {levelOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)}
              className="rounded-full px-3 py-2 text-sm outline-none cursor-pointer" style={selectStyle}>
              <option value="">All positions</option>
              {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={() => setUrgentOnly(v => !v)}
              className="rounded-full px-3.5 py-2 text-sm font-semibold transition-colors flex items-center gap-1.5"
              style={{
                backgroundColor: urgentOnly ? 'rgba(245,158,11,0.15)' : '#0d1020',
                border: `1px solid ${urgentOnly ? '#f59e0b' : '#1e2235'}`,
                color: urgentOnly ? '#f59e0b' : '#8892aa',
              }}>
              🔴 Urgent
            </button>
            {hasActiveFilters && (
              <button onClick={() => { setSearch(''); setLevelFilter(''); setPositionFilter(''); setUrgentOnly(false) }}
                className="text-xs uppercase tracking-wider transition-colors" style={{ color: '#8892aa' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#e8dece')}
                onMouseLeave={e => (e.currentTarget.style.color = '#8892aa')}>
                Clear
              </button>
            )}
          </div>
        )}

        {/* Opportunities list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
          </div>
        ) : displayed.length === 0 ? (
          <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>
              {hasActiveFilters
                ? 'No roles match your filters.'
                : activeTab === 'mine'
                  ? "You haven't posted any roles yet. Post a role to start receiving applications."
                  : 'No opportunities yet.'}
            </p>
            {hasActiveFilters ? (
              <button onClick={() => { setSearch(''); setLevelFilter(''); setPositionFilter(''); setUrgentOnly(false) }}
                className="mt-4 text-sm font-semibold uppercase tracking-wider px-5 py-2.5 rounded-full"
                style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', color: '#2d5fc4' }}>
                Clear filters
              </button>
            ) : canPost && (
              <button onClick={() => setShowForm(true)}
                className="mt-4 text-sm font-semibold uppercase tracking-wider px-5 py-2.5 rounded-full"
                style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                Post your first role
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {displayed.map(opp => {
              const deadlineDays = opp.deadline ? daysUntilDeadline(opp.deadline) : null
              const isCoachingRole = opp.opportunity_type === 'coach'
              const isViewing = viewingApplicants?.id === opp.id
              const justPosted = Date.now() - new Date(opp.created_at).getTime() < 48 * 3600000
              const showPos = opp.position && !opp.title.toLowerCase().includes(opp.position.toLowerCase())
              const meta = [opp.club, opp.location, showPos ? opp.position : null].filter(Boolean).join(' · ')
              const applied = appliedIds.has(opp.id)
              const isApplying = applying === opp.id
              // Coaches can apply to other clubs' coaching-staff roles
              const canApply = !opp.isOwn && isCoachingRole && opp.is_active

              return (
                <div key={opp.id}
                  className="relative rounded-2xl overflow-hidden transition-all"
                  style={{
                    backgroundColor: opp.isOwn ? 'rgba(45,95,196,0.06)' : '#13172a',
                    border: `1px solid ${isViewing ? '#2d5fc4' : opp.isOwn ? 'rgba(45,95,196,0.5)' : '#1e2235'}`,
                    opacity: opp.is_active ? 1 : 0.65,
                  }}
                  onMouseEnter={e => {
                    if (isViewing) return
                    e.currentTarget.style.borderColor = 'rgba(45,95,196,0.5)'
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(45,95,196,0.12)'
                  }}
                  onMouseLeave={e => {
                    if (isViewing) return
                    e.currentTarget.style.borderColor = opp.isOwn ? 'rgba(45,95,196,0.5)' : '#1e2235'
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}>
                  {/* Edge-stripe — urgent (red) takes priority, else own roles (blue) */}
                  {(opp.urgent || opp.isOwn) && (
                    <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, backgroundColor: opp.urgent ? '#ef4444' : '#2d5fc4' }} />
                  )}

                  <div className="p-4 lg:p-5">
                    <div className="flex gap-3.5">
                      <LevelBadge level={opp.level} />

                      <div className="flex-1 min-w-0">
                        {/* Title row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <ClubCrest club={opp.club} />
                            <h3 className="font-bold uppercase truncate"
                              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', fontSize: 19, lineHeight: 1.1 }}>
                              {opp.title}
                            </h3>
                          </div>
                          <span className="text-xs flex-shrink-0 pt-1" style={{ color: '#5b6478' }}>{timeAgo(opp.created_at)}</span>
                        </div>

                        {/* Single meta line */}
                        <p className="text-xs mt-1 truncate" style={{ color: '#8892aa' }}>
                          {meta || 'Details to follow'}
                        </p>

                        {/* Description */}
                        {opp.description && (
                          <p className="text-xs mt-2 line-clamp-2" style={{ color: '#6b7488' }}>{opp.description}</p>
                        )}

                        {/* Status chips + action */}
                        <div className="flex items-center justify-between gap-2 flex-wrap mt-3">
                          <div className="flex flex-wrap gap-1.5">
                            {opp.isOwn && <Chip color="#4d8ae8" bg="rgba(45,95,196,0.2)">★ Your role</Chip>}
                            {isCoachingRole && <Chip color="#a78bfa" bg="rgba(167,139,250,0.1)">Coaching Staff</Chip>}
                            {!opp.is_active && <Chip color="#8892aa" bg="rgba(136,146,170,0.1)">Closed</Chip>}
                            {opp.urgent && <Chip color="#f87171" bg="rgba(239,68,68,0.12)">🔴 Urgent</Chip>}
                            {deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 7 && (
                              <Chip color="#fbbf24" bg="rgba(251,191,36,0.12)">⏳ {deadlineDays}d left</Chip>
                            )}
                            {justPosted && opp.is_active && <Chip color="#4d8ae8" bg="rgba(45,95,196,0.12)">⚡ Just posted</Chip>}
                          </div>

                          {opp.isOwn ? (
                            <button onClick={() => setViewingApplicants(isViewing ? null : opp)}
                              className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                              style={{
                                backgroundColor: opp.application_count > 0 ? '#2d5fc4' : 'transparent',
                                color: opp.application_count > 0 ? '#fff' : '#8892aa',
                                border: `1px solid ${opp.application_count > 0 ? '#2d5fc4' : '#1e2235'}`,
                              }}>
                              👥 {opp.application_count} {isViewing ? '✕' : '→'}
                            </button>
                          ) : canApply && !isApplying && (
                            applied ? (
                              <span className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                                style={{ color: '#2d5fc4', border: '1px solid #2d5fc4' }}>
                                ✓ Applied
                              </span>
                            ) : isPremium ? (
                              <button onClick={() => { setApplying(opp.id); setApplyMessage('') }}
                                className="flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
                                style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3a6fda')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2d5fc4')}>
                                Apply
                              </button>
                            ) : (
                              <a href="/dashboard/coach/premium"
                                className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                                style={{ backgroundColor: 'rgba(45,95,196,0.1)', border: '1px solid rgba(45,95,196,0.35)', color: '#2d5fc4', textDecoration: 'none' }}>
                                🔒 Coach Pro
                              </a>
                            )
                          )}
                        </div>

                        {/* Inline apply composer */}
                        {isApplying && (
                          <div className="space-y-2 mt-3">
                            <textarea value={applyMessage} onChange={e => setApplyMessage(e.target.value)} rows={3}
                              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
                              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2d5fc4', color: '#e8dece' }}
                              placeholder="Tell the club about your coaching background (optional)…" />
                            <div className="flex gap-2">
                              <button onClick={() => { setApplying(null); setApplyMessage('') }}
                                className="flex-1 rounded-full py-2 text-xs font-semibold uppercase tracking-wider"
                                style={{ border: '1px solid #1e2235', color: '#8892aa' }}>
                                Cancel
                              </button>
                              <button onClick={() => handleApply(opp)}
                                className="flex-1 rounded-full py-2 text-xs font-semibold uppercase tracking-wider"
                                style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                                Confirm Apply
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Manage footer — own roles only */}
                    {opp.isOwn && (
                      <div className="flex items-center gap-3 mt-4 pt-3" style={{ borderTop: '1px solid #1e2235' }}>
                        <button onClick={() => toggleActive(opp)}
                          className="text-xs uppercase tracking-wider transition-colors"
                          style={{ color: '#8892aa' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#e8dece')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#8892aa')}>
                          {opp.is_active ? 'Close Role' : 'Reopen Role'}
                        </button>
                        <span style={{ color: '#1e2235' }}>·</span>
                        <button onClick={() => deleteOpp(opp.id)}
                          className="text-xs uppercase tracking-wider transition-colors"
                          style={{ color: '#8892aa' }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#8892aa')}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
