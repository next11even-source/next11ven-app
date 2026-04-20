'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { timeAgo } from '@/lib/utils'
import { useSidebar } from '../_components/SidebarContext'

// ─── Types ────────────────────────────────────────────────────────────────────

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

type PlayerProfile = {
  id: string
  city: string | null
  position: string | null
  premium: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecent(d: string) { return Date.now() - new Date(d).getTime() < 48 * 3600000 }
function daysLeft(d: string) { return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) }

function Chip({ children, color, bg, pulse }: { children: React.ReactNode; color: string; bg: string; pulse?: boolean }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${pulse ? 'animate-pulse' : ''}`}
      style={{ color, backgroundColor: bg }}>
      {children}
    </span>
  )
}

const APP_STATUS: Record<string, { color: string; bg: string; label: string }> = {
  pending:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Pending' },
  viewed:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'Viewed' },
  shortlisted: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'Shortlisted' },
  rejected:    { color: '#8892aa', bg: 'rgba(136,146,170,0.1)',  label: 'Not Progressed' },
}

function SkeletonRow() {
  return (
    <div className="rounded-2xl p-4 space-y-3 animate-pulse" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="h-4 rounded w-48" style={{ backgroundColor: '#1e2235' }} />
      <div className="h-3 rounded w-64" style={{ backgroundColor: '#1e2235' }} />
      <div className="flex gap-2">
        <div className="h-5 w-16 rounded-full" style={{ backgroundColor: '#1e2235' }} />
        <div className="h-5 w-20 rounded-full" style={{ backgroundColor: '#1e2235' }} />
      </div>
    </div>
  )
}

// ─── Opportunities Tab ────────────────────────────────────────────────────────

function OpportunitiesTab({ playerId, profile }: { playerId: string; profile: PlayerProfile | null }) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  const isPremium = profile?.premium ?? false
  const playerCity = profile?.city ?? null

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
    const res = await fetch('/api/applications/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity_id: opp.id, message: message.trim() || null }),
    })
    if (res.ok) {
      setAppliedIds(prev => new Set([...prev, opp.id]))
      setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, application_count: o.application_count + 1 } : o))
      setApplying(null)
      setMessage('')
    }
  }

  if (loading) return (
    <div className="space-y-4 px-4 py-4">
      {[0,1,2].map(i => <SkeletonRow key={i} />)}
    </div>
  )

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
              <div>
                <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{opp.title}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                  <Link href={`/dashboard/coach/${opp.coach_id}`}
                    style={{ color: '#2d5fc4', textDecoration: 'none' }}
                    onClick={e => e.stopPropagation()}>
                    {opp.coach?.full_name ?? 'Coach'}
                  </Link>{' · '}
                  {opp.location && <span>{opp.location}</span>}
                  {opp.location && ' · '}
                  {timeAgo(opp.created_at)}
                </p>
                {opp.club && (
                  isPremium ? (
                    <p className="text-xs mt-1 font-semibold" style={{ color: '#e8dece' }}>{opp.club}</p>
                  ) : (
                    <a href="/dashboard/player/premium"
                      className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={{ backgroundColor: 'rgba(45,95,196,0.12)', border: '1px solid rgba(45,95,196,0.3)', color: '#2d5fc4', textDecoration: 'none' }}>
                      <span>🔒</span>
                      <span>Unlock club name — go Premium</span>
                    </a>
                  )
                )}
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
                isPremium ? (
                  <button onClick={() => !applied && setApplying(opp.id)} disabled={applied}
                    className="w-full rounded-2xl py-3 text-sm font-bold uppercase tracking-wider transition-colors disabled:cursor-default"
                    style={{
                      backgroundColor: applied ? 'transparent' : '#2d5fc4',
                      color: applied ? '#2d5fc4' : '#fff',
                      border: applied ? '1px solid #2d5fc4' : 'none',
                    }}>
                    {applied ? '✓ Applied' : 'Apply Now'}
                  </button>
                ) : (
                  <a href="/dashboard/player/premium"
                    className="w-full rounded-2xl py-3 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                    style={{ backgroundColor: 'rgba(45,95,196,0.1)', border: '1px solid rgba(45,95,196,0.35)', color: '#2d5fc4', textDecoration: 'none' }}>
                    <span>🔒</span> Go Premium to See Club &amp; Apply
                  </a>
                )
              )}
            </div>
          </div>
        )
      })}
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

  if (loading) return (
    <div className="space-y-3 px-4 py-4">
      {[0,1,2].map(i => <SkeletonRow key={i} />)}
    </div>
  )

  return (
    <div className="space-y-3 px-4 py-4">
      {applications.length === 0 ? (
        <div className="rounded-2xl p-10 text-center space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>You haven't applied for any roles yet.</p>
          <Link href="/dashboard/player/opportunities"
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
            Browse Opportunities
          </Link>
        </div>
      ) : applications.map(app => {
        const cfg = APP_STATUS[app.status] ?? APP_STATUS.pending
        return (
          <div key={app.id} className="rounded-2xl p-4 space-y-2"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{app.opportunity?.title ?? 'Opportunity'}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                  {[app.opportunity?.club, app.opportunity?.location, app.opportunity?.position].filter(Boolean).join(' · ') || '—'}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OpportunitiesPage() {
  const router = useRouter()
  const { openSidebar } = useSidebar()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [activeTab, setActiveTab] = useState<'opportunities' | 'applications'>('opportunities')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setPlayerId(user.id)
      supabase.from('profiles').select('id, city, position, premium').eq('id', user.id).single()
        .then(({ data }) => setProfile(data as PlayerProfile))
    })
  }, [])

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
            { key: 'opportunities', label: 'Open Roles' },
            { key: 'applications',  label: 'My Applications' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                backgroundColor: activeTab === t.key ? '#2d5fc4' : 'transparent',
                color: activeTab === t.key ? '#fff' : '#8892aa',
                border: activeTab === t.key ? 'none' : '1px solid #1e2235',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {playerId && (
        activeTab === 'opportunities'
          ? <OpportunitiesTab playerId={playerId} profile={profile} />
          : <ApplicationsTab playerId={playerId} />
      )}
    </div>
  )
}
