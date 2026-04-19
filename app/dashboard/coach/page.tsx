'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { getLevelConfig } from '@/lib/opportunityLevel'
import CoachSidebar from './_components/CoachSidebar'
import { timeAgo } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'free_agent' | 'signed' | 'loan_dual_reg' | 'just_exploring'

type CoachOpportunity = {
  id: string
  title: string
  location: string | null
  level: string | null
  position: string | null
  urgent: boolean
  created_at: string
  opportunity_type: string | null
  coach: { full_name: string | null; club: string | null } | null
}

type Player = {
  id: string
  role: string | null
  full_name: string | null
  position: string | null
  secondary_position: string | null
  club: string | null
  avatar_url: string | null
  status: Status | null
  location: string | null
  city: string | null
  playing_level: string | null
  weekly_views: number
  premium: boolean
  created_at: string
  last_active: string | null
  coaching_role: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  free_agent:    { label: 'Free Agent',                   color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  signed:        { label: 'Signed to a club',             color: '#8892aa', bg: 'rgba(136,146,170,0.1)' },
  loan_dual_reg: { label: 'Looking for Loan / Dual Reg',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  just_exploring:{ label: 'Just Exploring',               color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}

function Avatar({ name, url, size = 40 }: { name: string | null; url: string | null; size?: number }) {
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? ''}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-bold"
      style={{ width: size, height: size, backgroundColor: '#1e2235', color: '#8892aa', fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  )
}

function StatusBadge({ status }: { status: Status | null }) {
  if (!status) return null
  const cfg = STATUS_CONFIG[status]
  if (!cfg) return null
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

// ─── Premium Carousel ─────────────────────────────────────────────────────────

function PremiumCarousel({ players }: { players: Player[] }) {
  const ref = useRef<HTMLDivElement>(null)

  if (players.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(45,95,196,0.2)', color: '#2d5fc4' }}>
            Premium
          </span>
          <h2 className="text-base font-bold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Featured Players
          </h2>
        </div>
        <div className="flex gap-2">
          <button onClick={() => ref.current?.scrollBy({ left: -260, behavior: 'smooth' })}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}>‹</button>
          <button onClick={() => ref.current?.scrollBy({ left: 260, behavior: 'smooth' })}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}>›</button>
        </div>
      </div>

      <div ref={ref} className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
        {players.map((p) => (
          <Link key={p.id}
            href={`/dashboard/player/players/${p.id}`}
            className="flex-shrink-0 rounded-xl overflow-hidden transition-all block"
            style={{ width: 220, scrollSnapAlign: 'start', backgroundColor: '#13172a', border: '1px solid #2d5fc4', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3a6fda')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}>
            {/* Photo or gradient header */}
            <div className="relative" style={{ height: 120, backgroundColor: '#1a1f3a' }}>
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="w-full h-full object-cover object-top" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #1e2235 0%, #0d1020 100%)' }}>
                  <span className="text-3xl font-black"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#1e2235' }}>
                    {p.position?.slice(0, 2).toUpperCase() ?? '??'}
                  </span>
                </div>
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #13172a 0%, transparent 60%)' }} />
              <div className="absolute top-2 right-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'rgba(45,95,196,0.9)', color: '#fff' }}>PRO</span>
              </div>
            </div>

            <div className="p-4 space-y-2">
              <div>
                <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{p.full_name ?? 'Player'}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                  {[p.position, p.city || p.location].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              {p.playing_level && (
                <p className="text-xs" style={{ color: '#8892aa' }}>{p.playing_level}</p>
              )}
              <StatusBadge status={p.status} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─── Suggested Players Grid ───────────────────────────────────────────────────

function SuggestedPlayers({ players }: { players: Player[] }) {
  if (players.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="space-y-0.5">
          <h2 className="text-base font-bold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Active &amp; Available
          </h2>
          <p className="text-xs" style={{ color: '#8892aa' }}>Players currently looking for clubs</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {players.map((p) => (
          <Link key={p.id}
            href={`/dashboard/player/players/${p.id}`}
            className="rounded-xl p-4 flex items-center gap-3 transition-all"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}>
            <Avatar name={p.full_name} url={p.avatar_url} size={48} />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                  {p.full_name ?? 'Player'}
                </p>
                {p.premium && (
                  <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                    style={{ backgroundColor: 'rgba(45,95,196,0.2)', color: '#2d5fc4', fontSize: 10 }}>PRO</span>
                )}
              </div>
              <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                {[p.position, p.city || p.location].filter(Boolean).join(' · ') || '—'}
              </p>
              {p.playing_level && (
                <p className="text-xs truncate" style={{ color: '#8892aa' }}>{p.playing_level}</p>
              )}
              <StatusBadge status={p.status} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─── New Joiners ──────────────────────────────────────────────────────────────

function NewJoiners({ players }: { players: Player[] }) {
  const ref = useRef<HTMLDivElement>(null)

  if (players.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#2d5fc4' }} />
          <h2 className="text-base font-bold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            New to the Platform
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full font-bold"
            style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4' }}>
            {players.length}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => ref.current?.scrollBy({ left: -200, behavior: 'smooth' })}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}>‹</button>
          <button onClick={() => ref.current?.scrollBy({ left: 200, behavior: 'smooth' })}
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}>›</button>
        </div>
      </div>

      <div ref={ref} className="flex gap-3 overflow-x-auto pb-2"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {players.map((p) => {
          const isCoach = p.role === 'coach'
          const subtitle = isCoach ? (p.coaching_role ?? p.city ?? '—') : (p.position ?? p.city ?? '—')
          const initials = p.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
          return (
            <Link key={p.id}
              href={`/dashboard/player/players/${p.id}`}
              className="flex-shrink-0 rounded-xl overflow-hidden block"
              style={{ width: 150, scrollSnapAlign: 'start', border: '1px solid #1e2235', textDecoration: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}>
              <div className="relative" style={{ height: 150 }}>
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="w-full h-full object-cover object-center" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1e2235' }}>
                    <span className="text-4xl font-black"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d3050' }}>
                      {initials}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.9) 0%, transparent 60%)' }} />
                {/* Role badge */}
                <div className="absolute top-2 left-2">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: isCoach ? 'rgba(167,139,250,0.85)' : 'rgba(45,95,196,0.85)',
                      color: '#fff', fontSize: 10,
                    }}>
                    {isCoach ? 'COACH' : 'PLAYER'}
                  </span>
                </div>
              </div>
              <div className="px-3 py-2.5" style={{ backgroundColor: '#13172a' }}>
                <p className="text-xs font-semibold truncate" style={{ color: '#e8dece' }}>
                  {p.full_name ?? (isCoach ? 'Coach' : 'Player')}
                </p>
                <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa', fontSize: 11 }}>
                  {subtitle}
                </p>
                {!isCoach && p.status && <StatusBadge status={p.status} />}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// ─── Quick Stats Bar ──────────────────────────────────────────────────────────

function CoachQuickStats({ newApps, availablePlayers, unread }: { newApps: number; availablePlayers: number; unread: number }) {
  const stats = [
    {
      label: 'New Applications', value: newApps, href: '/dashboard/coach/opportunities', sub: 'this week',
      color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.4)',
    },
    {
      label: 'Available Players', value: availablePlayers, href: '/dashboard/player/players', sub: 'right now',
      color: '#2d5fc4', bg: 'rgba(45,95,196,0.07)', border: 'rgba(45,95,196,0.5)',
    },
    {
      label: 'Unread Messages', value: unread, href: '/dashboard/coach/messages', sub: 'unread',
      color: '#a78bfa', bg: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.4)',
    },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map((s) => (
        <Link key={s.label} href={s.href}
          className="flex flex-col items-center justify-center rounded-2xl py-3 px-2 transition-all"
          style={{ backgroundColor: s.bg, border: `1.5px solid ${s.border}`, textDecoration: 'none' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = s.color)}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = s.border)}>
          <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: s.color }}>
            {s.value}
          </span>
          <span className="text-xs mt-1 text-center leading-tight font-semibold" style={{ color: '#e8dece', fontSize: 10 }}>{s.label}</span>
          <span className="text-xs mt-0.5 text-center leading-tight" style={{ color: '#8892aa' }}>{s.sub}</span>
        </Link>
      ))}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonPulse({ h = 16, rounded = 'rounded-lg' }: { h?: number; rounded?: string }) {
  return <div className={`animate-pulse ${rounded} w-full`} style={{ height: h, backgroundColor: '#1e2235' }} />
}

function CoachHomeSkeleton() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <header className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="animate-pulse rounded h-0.5 w-5" style={{ backgroundColor: '#1e2235' }} />
          <div className="animate-pulse rounded h-0.5 w-4" style={{ backgroundColor: '#1e2235' }} />
          <div className="animate-pulse rounded h-0.5 w-5" style={{ backgroundColor: '#1e2235' }} />
        </div>
        <SkeletonPulse h={36} rounded="rounded-lg" />
        <div style={{ width: 22 }} />
      </header>
      <main className="max-w-5xl mx-auto px-6 py-4 space-y-6" style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom) + 24px)' }}>
        <div className="space-y-2">
          <SkeletonPulse h={32} rounded="rounded-lg" />
          <SkeletonPulse h={16} rounded="rounded-lg" />
        </div>
        <SkeletonPulse h={100} rounded="rounded-2xl" />
        <div className="grid grid-cols-3 gap-2">
          {[0,1,2].map(i => <SkeletonPulse key={i} h={72} rounded="rounded-2xl" />)}
        </div>
        <div className="space-y-3">
          <SkeletonPulse h={80} rounded="rounded-xl" />
          <SkeletonPulse h={80} rounded="rounded-xl" />
          <SkeletonPulse h={80} rounded="rounded-xl" />
        </div>
      </main>
    </div>
  )
}

// ─── Recently Joined Players ──────────────────────────────────────────────────

type RecentPlayer = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  playing_level: string | null
  status: Status | null
}

function RecentlyJoined({ players }: { players: RecentPlayer[] }) {
  if (players.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#2d5fc4' }} />
        <h2 className="text-base font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          New to the Platform
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
          style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4' }}>
          {players.length}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
        {players.map(p => {
          const initials = p.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
          const statusCfg = p.status ? STATUS_CONFIG[p.status] : null
          return (
            <Link key={p.id} href={`/dashboard/player/players/${p.id}`}
              className="flex-shrink-0 rounded-xl overflow-hidden block"
              style={{ width: 160, scrollSnapAlign: 'start', border: '1px solid #1e2235', textDecoration: 'none' }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#2d5fc4')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#1e2235')}>
              <div className="relative" style={{ height: 200 }}>
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="w-full h-full object-cover object-center" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: '#1e2235' }}>
                    <span className="text-4xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d3050' }}>
                      {initials}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.9) 0%, transparent 60%)' }} />
                {statusCfg && (
                  <div className="absolute bottom-2 left-2 right-2">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}>
                      {statusCfg.label}
                    </span>
                  </div>
                )}
              </div>
              <div className="px-3 py-2.5" style={{ backgroundColor: '#13172a' }}>
                <p className="text-xs font-semibold truncate" style={{ color: '#e8dece' }}>{p.full_name ?? 'Player'}</p>
                <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa', fontSize: 11 }}>
                  {[p.position, p.playing_level].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// ─── Latest Opportunities ─────────────────────────────────────────────────────

function LatestOpportunities({ opportunities, viewerPremium }: { opportunities: CoachOpportunity[]; viewerPremium: boolean }) {
  if (opportunities.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-base font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Latest Opportunities
        </h2>
        <Link href="/dashboard/coach/opportunities" className="text-xs" style={{ color: '#2d5fc4', textDecoration: 'none' }}>
          Post a role →
        </Link>
      </div>
      <div className="space-y-2">
        {opportunities.map(opp => {
          const isCoachRole = opp.opportunity_type === 'coach'
          const lvl = getLevelConfig(opp.level)
          return (
            <Link key={opp.id} href="/dashboard/coach/opportunities"
              className="flex items-center gap-3 rounded-xl px-4 py-3.5 transition-all"
              style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none', display: 'flex' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2235')}>
              {/* Level badge */}
              <div className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl px-2"
                style={{ minWidth: 44, height: 44, backgroundColor: lvl.bg, border: `1px solid ${lvl.color}40` }}>
                <span className="font-black leading-none" style={{ color: lvl.color, fontSize: 9, letterSpacing: '0.05em' }}>{lvl.line1}</span>
                {lvl.line2 && <span className="font-black leading-none mt-0.5" style={{ color: lvl.color, fontSize: lvl.line2.length <= 2 ? 16 : 10 }}>{lvl.line2}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-xs font-semibold truncate" style={{ color: lvl.color }}>
                    {opp.coach?.club ?? 'Unknown Club'}
                  </p>
                </div>
                <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{opp.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs" style={{ color: '#8892aa' }}>
                    {isCoachRole ? 'Coaching Role' : opp.position ?? 'Any Position'} · {timeAgo(opp.created_at)}
                  </p>
                  {opp.urgent && <span className="text-xs" style={{ color: '#ef4444' }}>🔴 Urgent</span>}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1e2235" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachDashboard() {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [coachProfile, setCoachProfile] = useState<{ full_name: string | null; avatar_url: string | null; coaching_role: string | null } | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [premiumPlayers, setPremiumPlayers] = useState<Player[]>([])
  const [latestOpportunities, setLatestOpportunities] = useState<CoachOpportunity[]>([])

  const [recentPlayers, setRecentPlayers] = useState<RecentPlayer[]>([])
  const [statsNewApps, setStatsNewApps] = useState(0)
  const [statsAvailable, setStatsAvailable] = useState(0)
  const [statsUnread, setStatsUnread] = useState(0)
  const [viewerPremium, setViewerPremium] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, premium, avatar_url, coaching_role')
        .eq('id', user.id)
        .single()
      setFullName(profile?.full_name ?? null)
      setViewerPremium(profile?.premium ?? false)
      setCoachProfile({ full_name: profile?.full_name ?? null, avatar_url: profile?.avatar_url ?? null, coaching_role: profile?.coaching_role ?? null })

      const playerSelect = 'id, role, full_name, position, secondary_position, club, avatar_url, status, location, city, playing_level, weekly_views, premium, created_at, last_active, coaching_role'

      // Premium players — shuffled so order is random each session
      const { data: premium } = await supabase
        .from('profiles')
        .select(playerSelect)
        .in('role', ['player', 'admin'])
        .eq('approved', true)
        .eq('premium', true)
        .limit(20)
      const shuffled = ((premium as Player[]) ?? []).sort(() => Math.random() - 0.5)
      setPremiumPlayers(shuffled)

      // Latest opportunities (all types, all coaches)
      const { data: opps } = await supabase
        .from('opportunities')
        .select('id, title, location, level, position, urgent, created_at, opportunity_type, coach:coach_id(full_name, club)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(8)
      setLatestOpportunities((opps as unknown as CoachOpportunity[]) ?? [])

      // Recently joined players (approved, players only, with avatar, newest first)
      const { data: recentP } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, position, playing_level, status')
        .in('role', ['player', 'admin'])
        .eq('approved', true)
        .not('avatar_url', 'is', null)
        .neq('avatar_url', '')
        .order('created_at', { ascending: false })
        .limit(30)
      setRecentPlayers((recentP as RecentPlayer[]) ?? [])

      // Quick stats
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

      // New applications this week to this coach's opportunities
      const { count: appsCount } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', user.id)
        .gte('created_at', weekAgo)
      setStatsNewApps(appsCount ?? 0)

      // Available players count
      const { count: availCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .in('role', ['player', 'admin'])
        .eq('approved', true)
        .in('status', ['free_agent', 'loan_dual_reg', 'just_exploring'])
      setStatsAvailable(availCount ?? 0)

      // Unread messages count
      const { data: convs } = await supabase.from('conversations').select('id').eq('coach_id', user.id)
      if (convs?.length) {
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convs.map((c: { id: string }) => c.id))
          .neq('sender_id', user.id)
          .is('read_at', null)
        setStatsUnread(unreadCount ?? 0)
      }

      setLoading(false)

      // Auto-grant premium for existing Stripe subscribers who just claimed their account
      if (!profile?.premium) {
        fetch('/api/stripe/sync', { method: 'POST' }).then(r => r.json()).then(d => {
          if (d.synced) setViewerPremium(true)
        }).catch(() => {})
      }
    }
    load()
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <CoachSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={coachProfile} />

      {/* Header */}
      <header className="px-4 pt-6 pb-4 flex items-center justify-between">
        <button onClick={() => setSidebarOpen(true)} className="flex flex-col gap-1.5" style={{ width: 22 }}>
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 22 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 16 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 22 }} />
        </button>
        <img src="/logo.jpg" alt="NEXT11VEN" className="h-9 w-auto" />
        <div style={{ width: 22 }} />
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10" style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom) + 24px)' }}>
        {/* Welcome */}
        <div>
          <h1
            className="text-3xl font-extrabold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
          >
            Welcome{fullName ? `, ${fullName.split(' ')[0]}` : ' Back'}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#8892aa' }}>
            Scout and connect with non-league players.
          </p>
        </div>

        {/* Event Banner */}
        <div className="rounded-2xl p-4 flex flex-col gap-3"
          style={{ background: 'linear-gradient(135deg, #0d1a3a 0%, #13172a 100%)', border: '1px solid #2d5fc4' }}>
          <p className="text-sm leading-relaxed" style={{ color: '#e8dece' }}>
            🏆 <strong>End of Season Showcase Day</strong>
            <br />
            Register to attend and scout players at your level.
            <br />
            <span style={{ color: '#60a5fa' }}>Step 3–7 players registered.</span>
          </p>
          <a
            href="https://forms.gle/T5w5jneVc2rFUa4y6"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl py-2 text-xs font-bold uppercase tracking-wider text-center block"
            style={{ backgroundColor: '#e8dece', color: '#0a0a0a' }}>
            Register Interest
          </a>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-2">
              {[0,1,2].map(i => (
                <div key={i} className="animate-pulse rounded-2xl" style={{ height: 72, backgroundColor: '#1e2235' }} />
              ))}
            </div>
            {[0,1,2].map(i => (
              <div key={i} className="animate-pulse rounded-xl" style={{ height: 80, backgroundColor: '#1e2235' }} />
            ))}
          </div>
        ) : (
          <>
            <CoachQuickStats newApps={statsNewApps} availablePlayers={statsAvailable} unread={statsUnread} />
            <PremiumCarousel players={premiumPlayers} />
            <LatestOpportunities opportunities={latestOpportunities} viewerPremium={viewerPremium} />
            <RecentlyJoined players={recentPlayers} />
          </>
        )}
      </main>
    </div>
  )
}
