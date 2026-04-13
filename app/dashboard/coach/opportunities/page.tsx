'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import Breadcrumb from '@/app/components/Breadcrumb'

// ─── Types ────────────────────────────────────────────────────────────────────

type Opportunity = {
  id: string
  title: string
  club: string | null
  location: string | null
  position: string | null
  level: string | null
  description: string | null
  urgent: boolean
  deadline: string | null
  is_active: boolean
  created_at: string
  application_count?: number
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

const POSITIONS = [
  'Goalkeeper','Right Back','Centre Back','Left Back',
  'Defensive Midfielder','Central Midfielder','Right Midfielder',
  'Left Midfielder','Attacking Midfielder','Right Winger',
  'Left Winger','Second Striker','Striker','Centre Forward',
]

const COACHING_ROLES = [
  'Head Coach / Manager','Assistant Manager','First Team Coach',
  'Goalkeeping Coach','U18s / Academy Coach','Fitness & Conditioning Coach',
  'Scout / Analyst','Player-Coach',
]

const LEVELS = [
  'National League','National League North/South','Step 3','Step 4',
  'Step 5','Step 6','Step 7 and below',
]

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  pending:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  label: 'Pending' },
  viewed:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  label: 'Viewed' },
  shortlisted: { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', label: 'Shortlisted' },
  rejected:    { color: '#8892aa', bg: 'rgba(136,146,170,0.1)', label: 'Rejected' },
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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

// ─── Post Form ────────────────────────────────────────────────────────────────

function PostOpportunityForm({ coachId, onPosted, onCancel }: {
  coachId: string
  onPosted: (opp: Opportunity) => void
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
    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('opportunities')
      .insert({
        coach_id: coachId,
        title: title.trim(),
        club: club || null,
        location: location || null,
        position: position || null,
        level: level || null,
        description: description || null,
        urgent,
        deadline: deadline || null,
        opportunity_type: opportunityType,
      })
      .select()
      .single()

    if (err) { setError(err.message); setSaving(false); return }
    onPosted(data as Opportunity)
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

        {/* Type selector */}
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
          <Field label="Club Area (shown publicly)">
            <input value={club} onChange={e => setClub(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none" style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
              placeholder="e.g. Manchester club" />
          </Field>
          <Field label="Location">
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
          <Field label="Level">
            <select value={level} onChange={e => setLevel(e.target.value)}
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none" style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}>
              <option value="">Any level</option>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}
        dangerouslySetInnerHTML={{ __html: label }} />
      {children}
    </div>
  )
}

// ─── Applicants Panel ─────────────────────────────────────────────────────────

function ApplicantsPanel({ opportunity, onClose }: { opportunity: Opportunity; onClose: () => void }) {
  const [applicants, setApplicants] = useState<Applicant[]>([])
  const [loading, setLoading] = useState(true)

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
    const supabase = createClient()
    await supabase.from('applications').update({ status }).eq('id', applicationId)
    setApplicants(prev => prev.map(a => a.id === applicationId ? { ...a, status } : a))
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

              {/* Status controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs" style={{ color: '#8892aa' }}>Status:</span>
                {Object.entries(STATUS_COLORS).map(([key, cfg]) => (
                  <button key={key} onClick={() => updateStatus(a.id, key)}
                    className="text-xs px-2.5 py-1 rounded-full transition-all"
                    style={{
                      backgroundColor: a.status === key ? cfg.bg : 'transparent',
                      color: a.status === key ? cfg.color : '#8892aa',
                      border: `1px solid ${a.status === key ? cfg.color : '#1e2235'}`,
                    }}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachOpportunitiesPage() {
  const router = useRouter()
  const [coachId, setCoachId] = useState<string | null>(null)
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [viewingApplicants, setViewingApplicants] = useState<Opportunity | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      setCoachId(user.id)

      const { data: opps } = await supabase
        .from('opportunities')
        .select('*')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false })

      if (!opps) { setLoading(false); return }

      // Fetch application counts
      const counts = await Promise.all(
        opps.map(async (o) => {
          const { count } = await supabase
            .from('applications')
            .select('*', { count: 'exact', head: true })
            .eq('opportunity_id', o.id)
          return { id: o.id, count: count ?? 0 }
        })
      )
      const countMap = Object.fromEntries(counts.map(c => [c.id, c.count]))
      setOpportunities(opps.map(o => ({ ...o, application_count: countMap[o.id] ?? 0 })))
      setLoading(false)
    }
    load()
  }, [])

  function handlePosted(opp: Opportunity) {
    setOpportunities(prev => [{ ...opp, application_count: 0 }, ...prev])
    setShowForm(false)
  }

  async function toggleActive(opp: Opportunity) {
    const supabase = createClient()
    await supabase.from('opportunities').update({ is_active: !opp.is_active }).eq('id', opp.id)
    setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, is_active: !o.is_active } : o))
  }

  async function deleteOpp(id: string) {
    const supabase = createClient()
    await supabase.from('opportunities').delete().eq('id', id)
    setOpportunities(prev => prev.filter(o => o.id !== id))
    if (viewingApplicants?.id === id) setViewingApplicants(null)
  }

  const daysUntilDeadline = (deadline: string) =>
    Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Nav */}
      <header className="sticky top-0 z-10 px-4 py-3 flex items-center"
        style={{ backgroundColor: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[{ label: 'Home', href: '/dashboard/coach' }, { label: 'Opportunities' }]} />
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold uppercase"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              My Opportunities
            </h1>
            <p className="text-sm mt-1" style={{ color: '#8892aa' }}>
              Post roles and manage applications
            </p>
          </div>
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="text-sm font-semibold uppercase tracking-wider px-5 py-2.5 rounded-full transition-colors"
              style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3a6fda')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2d5fc4')}>
              + Post Role
            </button>
          )}
        </div>

        {/* Post form */}
        {showForm && coachId && (
          <PostOpportunityForm
            coachId={coachId}
            onPosted={handlePosted}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Applicants panel */}
        {viewingApplicants && (
          <ApplicantsPanel
            opportunity={viewingApplicants}
            onClose={() => setViewingApplicants(null)}
          />
        )}

        {/* Opportunities list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
          </div>
        ) : opportunities.length === 0 ? (
          <div className="rounded-xl p-12 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>No opportunities posted yet.</p>
            <button onClick={() => setShowForm(true)}
              className="mt-4 text-sm font-semibold uppercase tracking-wider px-5 py-2.5 rounded-full"
              style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
              Post your first role
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {opportunities.map(opp => {
              const isViewing = viewingApplicants?.id === opp.id
              const deadlineDays = opp.deadline ? daysUntilDeadline(opp.deadline) : null

              return (
                <div key={opp.id}
                  className="rounded-xl p-5 space-y-4 transition-all"
                  style={{
                    backgroundColor: '#13172a',
                    border: `1px solid ${isViewing ? '#2d5fc4' : '#1e2235'}`,
                    opacity: opp.is_active ? 1 : 0.6,
                  }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <p className="text-base font-bold" style={{ color: '#e8dece' }}>{opp.title}</p>
                      <p className="text-xs" style={{ color: '#8892aa' }}>
                        {[opp.position, opp.club, opp.location, opp.level].filter(Boolean).join(' · ') || 'No details'}
                      </p>

                      {/* Chips */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {!opp.is_active && (
                          <Chip color="#8892aa" bg="rgba(136,146,170,0.1)">Closed</Chip>
                        )}
                        {opp.urgent && (
                          <Chip color="#f59e0b" bg="rgba(245,158,11,0.12)">🔴 Urgent</Chip>
                        )}
                        {deadlineDays !== null && deadlineDays <= 7 && deadlineDays >= 0 && (
                          <Chip color="#f87171" bg="rgba(248,113,113,0.1)">⏳ {deadlineDays}d left</Chip>
                        )}
                        {opp.position && (
                          <Chip color="#a78bfa" bg="rgba(167,139,250,0.1)">⚽ {opp.position}</Chip>
                        )}
                        {opp.location && (
                          <Chip color="#60a5fa" bg="rgba(96,165,250,0.1)">📍 {opp.location}</Chip>
                        )}
                        <Chip color="#e8dece" bg="rgba(232,222,206,0.05)">{timeAgo(opp.created_at)}</Chip>
                      </div>
                    </div>

                    {/* Applicant count */}
                    <button onClick={() => setViewingApplicants(isViewing ? null : opp)}
                      className="flex flex-col items-center rounded-xl px-4 py-3 transition-all flex-shrink-0"
                      style={{
                        backgroundColor: isViewing ? 'rgba(45,95,196,0.15)' : '#0d1020',
                        border: `1px solid ${isViewing ? '#2d5fc4' : '#1e2235'}`,
                      }}
                      onMouseEnter={e => !isViewing && (e.currentTarget.style.borderColor = '#2d5fc4')}
                      onMouseLeave={e => !isViewing && (e.currentTarget.style.borderColor = '#1e2235')}>
                      <span className="text-2xl font-black"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: opp.application_count! > 0 ? '#2d5fc4' : '#8892aa' }}>
                        {opp.application_count}
                      </span>
                      <span className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>
                        {opp.application_count === 1 ? 'Applicant' : 'Applicants'}
                      </span>
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-3 pt-1" style={{ borderTop: '1px solid #1e2235' }}>
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
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

function Chip({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ color, backgroundColor: bg }}>
      {children}
    </span>
  )
}
