'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { useSidebar } from '../_components/SidebarContext'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'opportunities' | 'activity' | 'applications' | 'messages'

type Opportunity = {
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
  created_at: string
  coach: { full_name: string | null } | null
  application_count: number
}

type Application = {
  id: string
  status: string
  created_at: string
  opportunity: {
    id: string
    title: string
    club: string | null
    location: string | null
    position: string | null
    level: string | null
  } | null
}

type ProfileView = {
  id: string
  viewed_at: string
  viewer_id: string
  viewer: {
    full_name: string | null
    club: string | null
    role: string | null
    avatar_url: string | null
  } | null
}

type PlayerProfile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  status: string | null
  city: string | null
  position: string | null
  premium: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecent(d: string) { return Date.now() - new Date(d).getTime() < 48 * 3600000 }
function daysLeft(d: string) { return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) }
function timeAgo(d: string) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Chip({ children, color, bg, pulse }: { children: React.ReactNode; color: string; bg: string; pulse?: boolean }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${pulse ? 'animate-pulse' : ''}`}
      style={{ color, backgroundColor: bg }}>
      {children}
    </span>
  )
}

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  pending:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Pending' },
  viewed:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'Viewed' },
  shortlisted: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'Shortlisted' },
  rejected:    { color: '#8892aa', bg: 'rgba(136,146,170,0.1)',  label: 'Not Progressed' },
}

// ─── Opportunities Tab ────────────────────────────────────────────────────────

function OpportunitiesTab({ playerId, playerCity, playerPosition, isPremium }: {
  playerId: string
  playerCity: string | null
  playerPosition: string | null
  isPremium: boolean
}) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [oppsRes, appsRes] = await Promise.all([
        supabase.from('opportunities').select('*, coach:coach_id(full_name)').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('applications').select('opportunity_id').eq('player_id', playerId),
      ])
      const opps = (oppsRes.data ?? []) as Opportunity[]
      const supabase2 = createClient()
      const withCounts = await Promise.all(opps.map(async o => {
        const { count } = await supabase2.from('applications').select('*', { count: 'exact', head: true }).eq('opportunity_id', o.id)
        return { ...o, application_count: count ?? 0 }
      }))
      setOpportunities(withCounts)
      setAppliedIds(new Set((appsRes.data ?? []).map((a: { opportunity_id: string }) => a.opportunity_id)))
      setLoading(false)
    }
    load()
  }, [playerId])

  async function handleApply(opp: Opportunity) {
    const supabase = createClient()
    const { error } = await supabase.from('applications').insert({
      opportunity_id: opp.id,
      player_id: playerId,
      coach_id: opp.coach_id,
      message: message.trim() || null,
    })
    if (!error) {
      setAppliedIds(prev => new Set([...prev, opp.id]))
      setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, application_count: o.application_count + 1 } : o))
      setApplying(null)
      setMessage('')
    }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-4 px-4 py-4">
      {opportunities.length === 0 ? (
        <div className="rounded-2xl p-10 text-center space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>No opportunities posted yet. Check back soon — coaches post new roles regularly.</p>
          <Link href="/dashboard/player/profile"
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
            Update My Profile
          </Link>
        </div>
      ) : opportunities.map(opp => {
        const applied = appliedIds.has(opp.id)
        const isApplying = applying === opp.id
        const local = playerCity && opp.location ? opp.location.toLowerCase().includes(playerCity.toLowerCase()) : false
        const deadlineDays = opp.deadline ? daysLeft(opp.deadline) : null
        const lowApplicants = opp.application_count < 5

        return (
          <div key={opp.id} className="rounded-2xl space-y-4 overflow-hidden"
            style={{ backgroundColor: '#13172a', border: `1px solid ${applied ? '#2d5fc4' : '#1e2235'}` }}>
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{opp.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                    <Link href={`/dashboard/coach/${opp.coach_id}`}
                      style={{ color: '#2d5fc4', textDecoration: 'none' }}
                      onClick={e => e.stopPropagation()}>
                      {opp.coach?.full_name ?? 'Coach'}
                    </Link>{' · '}
                    {isPremium
                      ? (opp.club ?? 'Club TBC')
                      : <span className="inline-flex items-center gap-1" style={{ color: '#2d5fc4' }}>
                          <span>🔒</span><span>Premium</span>
                        </span>
                    }{' · '}{timeAgo(opp.created_at)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {opp.urgent && <Chip color="#f59e0b" bg="rgba(245,158,11,0.15)" pulse>🔴 Urgent</Chip>}
                {isRecent(opp.created_at) && <Chip color="#2d5fc4" bg="rgba(45,95,196,0.15)">⚡ Just Posted</Chip>}
                {local && <Chip color="#60a5fa" bg="rgba(96,165,250,0.12)">📍 Local to You</Chip>}
                {lowApplicants && opp.application_count === 0 && <Chip color="#a78bfa" bg="rgba(167,139,250,0.12)">🚀 Be first to apply</Chip>}
                {lowApplicants && opp.application_count > 0 && <Chip color="#a78bfa" bg="rgba(167,139,250,0.12)">👥 Only {opp.application_count} applied</Chip>}
                {!lowApplicants && <Chip color="#8892aa" bg="rgba(136,146,170,0.08)">👥 {opp.application_count} applicants</Chip>}
                {opp.position && <Chip color="#e8dece" bg="rgba(232,222,206,0.06)">⚽ {opp.position}</Chip>}
                {opp.level && <Chip color="#e8dece" bg="rgba(232,222,206,0.06)">{opp.level}</Chip>}
                {opp.location && <Chip color="#e8dece" bg="rgba(232,222,206,0.06)">📍 {opp.location}</Chip>}
                {deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 14 && <Chip color="#f87171" bg="rgba(248,113,113,0.1)">⏳ {deadlineDays}d left</Chip>}
              </div>

              {opp.description && <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>{opp.description}</p>}

              {isApplying && (
                <div className="space-y-2">
                  <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                    className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
                    style={{ backgroundColor: '#0a0a0a', border: '1px solid #2d5fc4', color: '#e8dece' }}
                    placeholder="Tell the coach about yourself (optional)…" />
                  <div className="flex gap-2">
                    <button onClick={() => { setApplying(null); setMessage('') }}
                      className="flex-1 rounded-full py-2.5 text-sm font-semibold uppercase"
                      style={{ border: '1px solid #1e2235', color: '#8892aa' }}>
                      Cancel
                    </button>
                    <button onClick={() => handleApply(opp)}
                      className="flex-1 rounded-full py-2.5 text-sm font-semibold uppercase"
                      style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                      Confirm Apply
                    </button>
                  </div>
                </div>
              )}

              {!isApplying && (
                <button onClick={() => !applied && setApplying(opp.id)} disabled={applied}
                  className="w-full rounded-2xl py-3 text-sm font-bold uppercase tracking-wider transition-colors disabled:cursor-default"
                  style={{
                    backgroundColor: applied ? 'transparent' : '#2d5fc4',
                    color: applied ? '#2d5fc4' : '#fff',
                    border: applied ? '1px solid #2d5fc4' : 'none',
                  }}>
                  {applied ? '✓ Applied' : 'Apply Now'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── My Activity Tab ──────────────────────────────────────────────────────────

type ViewerGroup = {
  viewer_id: string
  full_name: string | null
  avatar_url: string | null
  club: string | null
  role: string | null
  count: number
  last_viewed: string
}

function ActivityTab({ playerId, profile, isPremium }: {
  playerId: string
  profile: PlayerProfile | null
  isPremium: boolean
}) {
  const [views, setViews] = useState<ProfileView[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('player_views')
      .select('id, viewer_id, viewed_at, viewer:viewer_id(full_name, club, role, avatar_url)')
      .eq('player_id', playerId)
      .order('viewed_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setViews((data as unknown as ProfileView[]) ?? [])
        setLoading(false)
      })
  }, [playerId])

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const weekViews = views.filter(v => v.viewed_at > weekAgo)
  const coachViews = weekViews.filter(v => v.viewer?.role === 'coach')

  // Deduplicate by viewer — most recent visit per person, with total count
  const viewerMap = new Map<string, ViewerGroup>()
  for (const v of views) {
    const vid = v.viewer_id
    if (!vid) continue
    const existing = viewerMap.get(vid)
    if (!existing) {
      viewerMap.set(vid, {
        viewer_id: vid,
        full_name: v.viewer?.full_name ?? null,
        avatar_url: v.viewer?.avatar_url ?? null,
        club: v.viewer?.club ?? null,
        role: v.viewer?.role ?? null,
        count: 1,
        last_viewed: v.viewed_at,
      })
    } else {
      existing.count++
      if (v.viewed_at > existing.last_viewed) existing.last_viewed = v.viewed_at
    }
  }
  const uniqueViewers = Array.from(viewerMap.values()).sort(
    (a, b) => new Date(b.last_viewed).getTime() - new Date(a.last_viewed).getTime()
  )
  const coachViewers = uniqueViewers.filter(v => v.role === 'coach')

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-5 px-4 py-4">

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Views this week', value: weekViews.length, sub: 'all roles' },
          { label: 'Coach views', value: coachViews.length, sub: 'this week', highlight: coachViews.length > 0 },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl px-4 py-4 text-center"
            style={{ backgroundColor: '#13172a', border: `1px solid ${stat.highlight ? 'rgba(45,95,196,0.4)' : '#1e2235'}` }}>
            <p className="text-3xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: stat.highlight ? '#2d5fc4' : '#e8dece' }}>
              {stat.value}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#e8dece' }}>{stat.label}</p>
            <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{stat.sub}</p>
          </div>
        ))}
      </div>

      {/* All-time count */}
      <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <p className="text-sm" style={{ color: '#8892aa' }}>Total profile views (all time)</p>
        <p className="text-lg font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{views.length}</p>
      </div>

      {/* Who viewed you */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-base font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Who Viewed You
          </h3>
          {!isPremium && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ backgroundColor: 'rgba(45,95,196,0.12)', color: '#2d5fc4', border: '1px solid rgba(45,95,196,0.3)' }}>
              Premium
            </span>
          )}
        </div>

        {uniqueViewers.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>No profile views yet — keep your profile updated to get noticed.</p>
          </div>
        ) : isPremium ? (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            {uniqueViewers.map((v, i) => {
              const initials = v.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
              const isCoach = v.role === 'coach'
              return (
                <div key={v.viewer_id} className="flex items-center gap-3 px-4 py-3.5"
                  style={{ backgroundColor: '#13172a', borderBottom: i < uniqueViewers.length - 1 ? '1px solid #1e2235' : undefined }}>
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
                      style={{ backgroundColor: '#1e2235' }}>
                      {v.avatar_url
                        ? <img src={v.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <span className="text-xs font-bold" style={{ color: isCoach ? '#a78bfa' : '#2d5fc4' }}>{initials}</span>}
                    </div>
                    {isCoach && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#a78bfa', fontSize: 7, color: '#fff', fontWeight: 'bold' }}>C</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                      {v.full_name ?? 'Unknown'}
                    </p>
                    <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                      {isCoach ? 'Coach' : 'Player'}{v.club ? ` · ${v.club}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs" style={{ color: '#8892aa' }}>{timeAgo(v.last_viewed)}</p>
                    {v.count > 1 && (
                      <p className="text-xs font-bold mt-0.5" style={{ color: '#2d5fc4' }}>{v.count}x</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Premium lock — show blurred rows + CTA */
          <div className="relative">
            <div className="rounded-2xl overflow-hidden pointer-events-none select-none"
              style={{ border: '1px solid #1e2235', filter: 'blur(4px)', opacity: 0.4 }}>
              {[...Array(Math.min(uniqueViewers.length, 4))].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5"
                  style={{ backgroundColor: '#13172a', borderBottom: i < 3 ? '1px solid #1e2235' : undefined }}>
                  <div className="w-10 h-10 rounded-full" style={{ backgroundColor: '#1e2235' }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded" style={{ backgroundColor: '#1e2235', width: '60%' }} />
                    <div className="h-2.5 rounded" style={{ backgroundColor: '#1e2235', width: '40%' }} />
                  </div>
                  <div className="h-2.5 w-10 rounded" style={{ backgroundColor: '#1e2235' }} />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl"
              style={{ backgroundColor: 'rgba(10,10,10,0.7)', backdropFilter: 'blur(2px)' }}>
              <p className="text-sm font-bold text-center px-6" style={{ color: '#e8dece' }}>
                {coachViewers.length > 0
                  ? `${coachViewers.length} coach${coachViewers.length > 1 ? 'es' : ''} viewed your profile`
                  : `${uniqueViewers.length} person${uniqueViewers.length > 1 ? 's' : ''} viewed your profile`}
              </p>
              <p className="text-xs text-center px-8" style={{ color: '#8892aa' }}>
                Upgrade to see exactly who's viewing you
              </p>
              <a href="/dashboard/player/premium"
                className="px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider"
                style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                Go Premium · £6.99/mo
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── My Applications Tab ──────────────────────────────────────────────────────

function ApplicationsTab({ playerId }: { playerId: string }) {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('applications')
      .select('id, status, created_at, opportunity:opportunity_id(id, title, club, location, position, level)')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setApplications((data as unknown as Application[]) ?? [])
        setLoading(false)
      })
  }, [playerId])

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-3 px-4 py-4">
      {applications.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>You haven't applied for any roles yet.</p>
        </div>
      ) : applications.map(app => {
        const cfg = STATUS_COLORS[app.status] ?? STATUS_COLORS.pending
        return (
          <div key={app.id} className="rounded-2xl p-4 space-y-2"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{app.opportunity?.title ?? 'Opportunity'}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                  {[app.opportunity?.club, app.opportunity?.location, app.opportunity?.position].filter(Boolean).join(' · ') || '—'}
                  {/* Club shown here — player has already applied so they see who they applied to */}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{timeAgo(app.created_at)}</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0"
                style={{ color: cfg.color, backgroundColor: cfg.bg }}>
                {cfg.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Messages Tab ─────────────────────────────────────────────────────────────

type Conversation = {
  id: string
  coach_id: string
  last_message_at: string
  coach: { full_name: string | null; avatar_url: string | null; club: string | null; coaching_role: string | null } | null
  last_message?: string
  unread?: number
}

type Message = {
  id: string
  sender_id: string
  content: string
  created_at: string
  read_at: string | null
}

function msgTimeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function ChatPanel({ conversation, playerId, onBack }: { conversation: Conversation; playerId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const c = conversation.coach
  const initials = c?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  useEffect(() => {
    const supabase = createClient()
    supabase.from('messages').select('id, sender_id, content, created_at, read_at')
      .eq('conversation_id', conversation.id).order('created_at', { ascending: true })
      .then(({ data }) => { setMessages((data as Message[]) ?? []); setLoading(false) })
    supabase.from('messages').update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversation.id).neq('sender_id', playerId).is('read_at', null).then(() => {})
  }, [conversation.id])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    const text = input.trim()
    setInput('')
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coach_id: conversation.coach_id, content: text }),
      })
      const data = await res.json()
      if (data.message) {
        setMessages(prev => [...prev, data.message as Message])
      }
    } catch {
      // silently fail — message was likely not sent
    }
    setSending(false)
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
      <button onClick={onBack} className="flex items-center gap-2 px-4 py-3 text-xs uppercase tracking-wider flex-shrink-0"
        style={{ color: '#8892aa', borderBottom: '1px solid #1e2235' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to messages
        <div className="ml-2 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1a1f3a' }}>
            {c?.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-bold" style={{ color: '#2d5fc4' }}>{initials}</span>}
          </div>
          <span style={{ color: '#e8dece' }}>{c?.full_name ?? 'Coach'}</span>
        </div>
      </button>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
          </div>
        ) : messages.map(msg => {
          const isMe = msg.sender_id === playerId
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-xs">
                <div className="px-4 py-2.5 rounded-2xl text-sm"
                  style={{ backgroundColor: isMe ? '#2d5fc4' : '#13172a', color: '#e8dece', border: isMe ? 'none' : '1px solid #1e2235',
                    borderBottomRightRadius: isMe ? 4 : undefined, borderBottomLeftRadius: !isMe ? 4 : undefined }}>
                  {msg.content}
                </div>
                <p className={`text-xs mt-1 ${isMe ? 'text-right' : ''}`} style={{ color: '#8892aa' }}>{msgTimeAgo(msg.created_at)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={sendReply}
        className="flex items-end gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid #1e2235' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(e as unknown as React.FormEvent) } }}
          placeholder="Reply…"
          rows={1}
          className="flex-1 rounded-2xl px-4 py-2.5 text-sm outline-none resize-none"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece', maxHeight: 100 }}
        />
        <button type="submit" disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: input.trim() ? '#2d5fc4' : '#1e2235' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  )
}

function MessagesTab({ playerId, isPremium: _isPremium }: { playerId: string; isPremium: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('conversations').select('id, coach_id, last_message_at')
      .eq('player_id', playerId).order('last_message_at', { ascending: false })
      .then(async ({ data }) => {
        if (!data || data.length === 0) { setLoading(false); return }
        const coachIds = data.map((c: { coach_id: string }) => c.coach_id)
        const { data: coaches } = await supabase.from('profiles')
          .select('id, full_name, avatar_url, club, coaching_role').in('id', coachIds)
        const coachMap = Object.fromEntries((coaches ?? []).map((c: { id: string; full_name: string | null; avatar_url: string | null; club: string | null; coaching_role: string | null }) => [c.id, c]))
        const convIds = data.map((c: { id: string }) => c.id)
        const { data: lastMsgs } = await supabase.from('messages').select('conversation_id, content')
          .in('conversation_id', convIds).order('created_at', { ascending: false })
        const lastMsgMap: Record<string, string> = {}
        for (const msg of (lastMsgs ?? [])) {
          if (!lastMsgMap[msg.conversation_id]) lastMsgMap[msg.conversation_id] = msg.content
        }
        const { data: unreadData } = await supabase.from('messages').select('conversation_id')
          .in('conversation_id', convIds).neq('sender_id', playerId).is('read_at', null)
        const unreadMap: Record<string, number> = {}
        for (const msg of (unreadData ?? [])) { unreadMap[msg.conversation_id] = (unreadMap[msg.conversation_id] ?? 0) + 1 }
        setConversations(data.map((c: { id: string; coach_id: string; last_message_at: string }) => ({
          ...c, coach: coachMap[c.coach_id] ?? null, last_message: lastMsgMap[c.id], unread: unreadMap[c.id] ?? 0,
        })))
        setLoading(false)
      })
  }, [playerId])

  if (selected) return <ChatPanel conversation={selected} playerId={playerId} onBack={() => { setSelected(null) }} />

  if (loading) return <div className="flex items-center justify-center py-12"><div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} /></div>

  if (conversations.length === 0) return (
    <div className="px-4 py-12 text-center">
      <p className="text-xl font-black uppercase mb-2" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>No messages yet</p>
      <p className="text-sm" style={{ color: '#8892aa' }}>When a coach messages you, it&apos;ll appear here.</p>
    </div>
  )

  const totalUnread = conversations.reduce((s, c) => s + (c.unread ?? 0), 0)

  return (
    <div>
      {totalUnread > 0 && (
        <div className="mx-4 mt-4 px-4 py-3 rounded-xl flex items-center gap-2"
          style={{ backgroundColor: 'rgba(45,95,196,0.1)', border: '1px solid #2d5fc440' }}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#2d5fc4' }} />
          <p className="text-sm" style={{ color: '#2d5fc4' }}>{totalUnread} unread message{totalUnread !== 1 ? 's' : ''}</p>
        </div>
      )}
      <div className="divide-y mt-2" style={{ borderColor: '#1e2235' }}>
        {conversations.map(conv => {
          const c = conv.coach
          const initials = c?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
          return (
            <button key={conv.id} onClick={() => setSelected(conv)}
              className="flex items-center gap-3 w-full px-4 py-4 text-left"
              style={{ backgroundColor: '#0a0a0a' }}>
              <div className="relative flex-shrink-0">
                <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center" style={{ backgroundColor: '#1a1f3a' }}>
                  {c?.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="font-black" style={{ color: '#2d5fc4' }}>{initials}</span>}
                </div>
                {(conv.unread ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: '#2d5fc4', color: '#fff', fontSize: 10 }}>{conv.unread}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{c?.full_name ?? 'Coach'}</p>
                  <p className="text-xs ml-2 flex-shrink-0" style={{ color: '#8892aa' }}>{msgTimeAgo(conv.last_message_at)}</p>
                </div>
                <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>{c?.coaching_role ?? 'Coach'}{c?.club ? ` · ${c.club}` : ''}</p>
                {conv.last_message && <p className="text-xs truncate mt-0.5" style={{ color: (conv.unread ?? 0) > 0 ? '#e8dece' : '#8892aa', fontWeight: (conv.unread ?? 0) > 0 ? 600 : 400 }}>{conv.last_message}</p>}
              </div>
            </button>
          )
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
    </div>
  )
}

// ─── Market Banner ────────────────────────────────────────────────────────────

const BANNERS: Record<Tab, { title: string; subtitle: string; color: string }> = {
  opportunities: { title: 'THE MARKET',  subtitle: 'OPPORTUNITIES', color: '#f59e0b' },
  activity:      { title: 'THE MARKET',  subtitle: 'MY ACTIVITY',   color: '#2d5fc4' },
  applications:  { title: 'THE MARKET',  subtitle: 'MY APPLICATIONS', color: '#a78bfa' },
  messages:      { title: 'THE MARKET',  subtitle: 'MESSAGES',      color: '#60a5fa' },
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function MarketPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { openSidebar } = useSidebar()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const activeTab = (searchParams.get('tab') as Tab) ?? 'activity'

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setPlayerId(user.id)
      supabase.from('profiles').select('id, full_name, avatar_url, status, city, position, premium').eq('id', user.id).single().then(({ data }) => {
        setProfile(data as PlayerProfile)
      })
      // Unread count for Messages tab badge
      const { data: convs } = await supabase.from('conversations').select('id').eq('player_id', user.id)
      if (convs?.length) {
        const { count } = await supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convs.map(c => c.id))
          .neq('sender_id', user.id)
          .is('read_at', null)
        setUnreadMessages(count ?? 0)
      }
    })
  }, [])

  function setTab(tab: Tab) {
    if (tab === 'messages') setUnreadMessages(0)
    router.replace(`/dashboard/player/market?tab=${tab}`)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'opportunities', label: 'Opportunities' },
    { key: 'activity',      label: 'My Activity' },
    { key: 'messages',      label: 'Messages' },
    { key: 'applications',  label: 'My Applications' },
  ]

  const banner = BANNERS[activeTab]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Tab strip */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-0"
        style={{ backgroundColor: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center justify-between mb-2">
          <button onClick={openSidebar} className="flex flex-col gap-1.5" style={{ width: 20 }}>
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 14 }} />
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
          </button>
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: '#8892aa' }}>The Market</p>
          <div style={{ width: 20 }} />
        </div>
        <div className="flex gap-1 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
          {tabs.map(t => {
            const hasUnread = t.key === 'messages' && unreadMessages > 0 && activeTab !== 'messages'
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-all relative"
                style={{
                  backgroundColor: activeTab === t.key ? '#13172a' : 'transparent',
                  color: activeTab === t.key ? '#e8dece' : '#8892aa',
                  border: activeTab === t.key ? '1px solid #2d5fc4' : '1px solid transparent',
                }}>
                {t.label}
                {hasUnread && (
                  <span className="flex items-center justify-center rounded-full text-xs font-bold"
                    style={{ minWidth: 18, height: 18, backgroundColor: '#f87171', color: '#fff', fontSize: 10, padding: '0 4px' }}>
                    {unreadMessages}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Banner */}
      <div className="mx-4 mt-4 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 flex items-end justify-between"
          style={{ background: 'linear-gradient(135deg, #0d1020 0%, #13172a 60%, #1a1f3a 100%)', minHeight: 90 }}>
          <div>
            <p className="text-xs uppercase tracking-widest font-bold" style={{ color: '#8892aa' }}>{banner.title}</p>
            <p className="text-3xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: banner.color }}>
              {banner.subtitle}
            </p>
          </div>
          <div className="w-16 h-16 rounded-full opacity-10"
            style={{ backgroundColor: banner.color, filter: 'blur(20px)' }} />
        </div>
      </div>

      {/* Tab content */}
      {playerId ? (
        <>
          {activeTab === 'opportunities' && (
            <OpportunitiesTab playerId={playerId} playerCity={profile?.city ?? null} playerPosition={profile?.position ?? null} isPremium={profile?.premium ?? false} />
          )}
          {activeTab === 'activity' && <ActivityTab playerId={playerId} profile={profile} isPremium={profile?.premium ?? false} />}
          {activeTab === 'applications' && <ApplicationsTab playerId={playerId} />}
          {activeTab === 'messages' && <MessagesTab playerId={playerId} isPremium={profile?.premium ?? false} />}
        </>
      ) : (
        <LoadingSpinner />
      )}
    </div>
  )
}

export default function MarketPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    }>
      <MarketPageContent />
    </Suspense>
  )
}
