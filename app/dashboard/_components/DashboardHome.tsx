'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = 'player' | 'coach' | 'fan'
type Status = 'available' | 'open_to_offers' | 'not_available'

type Opportunity = {
  id: string
  title: string
  club: string | null
  location: string | null
  position: string | null
  level: string | null
  created_at: string
  coach: { full_name: string | null } | null
}

type PlayerCard = {
  id: string
  full_name: string | null
  position: string | null
  club: string | null
  avatar_url: string | null
  weekly_views: number
}

type NewJoiner = {
  id: string
  full_name: string | null
  position: string | null
  club: string | null
  avatar_url: string
  created_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  available:      { label: 'Available',        color: '#4ade80', bg: 'rgba(74,222,128,0.1)' },
  open_to_offers: { label: 'Open to Offers',   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
  not_available:  { label: 'Not Available',     color: '#8892aa', bg: 'rgba(136,146,170,0.1)' },
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function Avatar({ name, avatarUrl, size = 40 }: { name: string | null; avatarUrl: string | null; size?: number }) {
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name ?? ''}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
      style={{ width: size, height: size, backgroundColor: '#1e2235', color: '#8892aa' }}
    >
      {initials}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded animate-pulse ${className}`}
      style={{ backgroundColor: '#1e2235' }}
    />
  )
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function PremiumCarousel({ players }: { players: PlayerCard[] }) {
  const ref = useRef<HTMLDivElement>(null)

  if (players.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(45,95,196,0.2)', color: '#2d5fc4' }}
          >
            Premium
          </span>
          <h2
            className="text-base font-bold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
          >
            Featured Players
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => ref.current?.scrollBy({ left: -220, behavior: 'smooth' })}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
          >
            ‹
          </button>
          <button
            onClick={() => ref.current?.scrollBy({ left: 220, behavior: 'smooth' })}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
          >
            ›
          </button>
        </div>
      </div>

      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto pb-2"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
      >
        {players.map((p) => (
          <div
            key={p.id}
            className="flex-shrink-0 rounded-xl p-4 space-y-3 cursor-pointer transition-colors"
            style={{
              width: 200,
              scrollSnapAlign: 'start',
              backgroundColor: '#13172a',
              border: '1px solid #1e2235',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
          >
            <div className="flex items-center justify-between">
              <Avatar name={p.full_name} avatarUrl={p.avatar_url} size={44} />
              <span
                className="text-xs font-bold px-2 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(45,95,196,0.2)', color: '#2d5fc4' }}
              >
                PRO
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                {p.full_name ?? 'Unknown'}
              </p>
              <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                {[p.position, p.club].filter(Boolean).join(' · ') || 'Player'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function NewJoinersCarousel({ players }: { players: NewJoiner[] }) {
  const ref = useRef<HTMLDivElement>(null)

  if (players.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: '#2d5fc4', boxShadow: '0 0 6px #2d5fc4' }}
          />
          <h2
            className="text-base font-bold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
          >
            New to the Platform
          </h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => ref.current?.scrollBy({ left: -200, behavior: 'smooth' })}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
          >
            ‹
          </button>
          <button
            onClick={() => ref.current?.scrollBy({ left: 200, behavior: 'smooth' })}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
          >
            ›
          </button>
        </div>
      </div>

      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto pb-2"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
      >
        {players.map((p) => (
          <Link
            key={p.id}
            href={`/dashboard/players/${p.id}`}
            className="flex-shrink-0 rounded-xl overflow-hidden transition-all group"
            style={{
              width: 130,
              scrollSnapAlign: 'start',
              border: '1px solid #1e2235',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
          >
            <div className="relative">
              <img
                src={p.avatar_url}
                alt={p.full_name ?? ''}
                className="w-full object-cover"
                style={{ height: 130 }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 px-2 py-1.5"
                style={{
                  background: 'linear-gradient(to top, rgba(10,10,10,0.9) 0%, transparent 100%)',
                }}
              >
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'rgba(45,95,196,0.3)', color: '#60a5fa', fontSize: 10 }}
                >
                  NEW
                </span>
              </div>
            </div>
            <div className="px-2.5 py-2" style={{ backgroundColor: '#13172a' }}>
              <p className="text-xs font-semibold truncate" style={{ color: '#e8dece' }}>
                {p.full_name ?? 'Player'}
              </p>
              <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa', fontSize: 11 }}>
                {p.position ?? p.club ?? 'Player'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function OpportunitiesSection({ opportunities, loading }: { opportunities: Opportunity[]; loading: boolean }) {
  return (
    <section className="space-y-3">
      <h2
        className="text-base font-bold uppercase px-1"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
      >
        Latest Opportunities
      </h2>

      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid #1e2235' }}
      >
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 space-y-2" style={{ borderBottom: i < 4 ? '1px solid #1e2235' : undefined }}>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))
        ) : opportunities.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: '#8892aa' }}>No opportunities posted yet.</p>
          </div>
        ) : (
          opportunities.map((opp, i) => (
            <div
              key={opp.id}
              className="p-4 flex items-start justify-between gap-3 cursor-pointer transition-colors group"
              style={{
                backgroundColor: '#13172a',
                borderBottom: i < opportunities.length - 1 ? '1px solid #1e2235' : undefined,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161b30')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#13172a')}
            >
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                  {opp.title}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {opp.club && (
                    <span className="text-xs" style={{ color: '#8892aa' }}>{opp.club}</span>
                  )}
                  {opp.position && (
                    <>
                      <span style={{ color: '#1e2235' }}>·</span>
                      <span className="text-xs" style={{ color: '#8892aa' }}>{opp.position}</span>
                    </>
                  )}
                  {opp.level && (
                    <>
                      <span style={{ color: '#1e2235' }}>·</span>
                      <span className="text-xs" style={{ color: '#8892aa' }}>{opp.level}</span>
                    </>
                  )}
                  {opp.location && (
                    <>
                      <span style={{ color: '#1e2235' }}>·</span>
                      <span className="text-xs" style={{ color: '#8892aa' }}>{opp.location}</span>
                    </>
                  )}
                </div>
              </div>
              <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: '#8892aa' }}>
                {timeAgo(opp.created_at)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function LeaderboardSection({ players, loading }: { players: PlayerCard[]; loading: boolean }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2
          className="text-base font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
        >
          Most Viewed This Week
        </h2>
        <span className="text-xs" style={{ color: '#8892aa' }}>Players</span>
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid #1e2235' }}
      >
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-3" style={{ borderBottom: i < 4 ? '1px solid #1e2235' : undefined }}>
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))
        ) : players.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: '#8892aa' }}>No views recorded yet this week.</p>
          </div>
        ) : (
          players.map((p, i) => (
            <div
              key={p.id}
              className="p-4 flex items-center gap-3 cursor-pointer transition-colors"
              style={{
                backgroundColor: '#13172a',
                borderBottom: i < players.length - 1 ? '1px solid #1e2235' : undefined,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#161b30')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#13172a')}
            >
              <span
                className="text-xs font-bold w-5 text-center flex-shrink-0"
                style={{ color: i < 3 ? '#2d5fc4' : '#8892aa' }}
              >
                {i + 1}
              </span>
              <Avatar name={p.full_name} avatarUrl={p.avatar_url} size={36} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                  {p.full_name ?? 'Unknown'}
                </p>
                <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                  {[p.position, p.club].filter(Boolean).join(' · ') || 'Player'}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{p.weekly_views}</p>
                <p className="text-xs" style={{ color: '#8892aa' }}>views</p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function PlayerStatusWidget({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .single()
      .then(({ data }) => setStatus((data?.status as Status) ?? 'open_to_offers'))
  }, [userId])

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Status
    setSaving(true)
    const supabase = createClient()
    await supabase.from('profiles').update({ status: next }).eq('id', userId)
    setStatus(next)
    setSaving(false)
  }

  const cfg = status ? STATUS_CONFIG[status] : null

  return (
    <section
      className="rounded-xl p-4 flex items-center justify-between gap-4"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
    >
      <div className="flex items-center gap-2 flex-shrink-0">
        {cfg && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />}
        <span
          className="text-sm font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
        >
          Your Availability
        </span>
      </div>

      <select
        value={status ?? ''}
        onChange={handleChange}
        disabled={saving || status === null}
        className="rounded-lg px-3 py-2 text-sm outline-none transition-colors appearance-none cursor-pointer disabled:opacity-50"
        style={{
          backgroundColor: '#0a0a0a',
          border: `1px solid ${cfg ? cfg.color : '#1e2235'}`,
          color: cfg ? cfg.color : '#8892aa',
          minWidth: 160,
        }}
      >
        {(Object.entries(STATUS_CONFIG) as [Status, typeof STATUS_CONFIG[Status]][]).map(([key, c]) => (
          <option key={key} value={key} style={{ color: '#e8dece', backgroundColor: '#13172a' }}>
            {c.label}
          </option>
        ))}
      </select>
    </section>
  )
}

function ProfileHealthWidget({ userId }: { userId: string }) {
  const [score, setScore] = useState<number | null>(null)
  const [streak, setStreak] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('profiles')
      .select('full_name, position, club, bio, avatar_url, status, goals, assists, appearances, highlight_urls, streak_weeks')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!data) return
        const checks = [
          !!data.avatar_url,
          !!data.full_name,
          !!data.position,
          !!data.club,
          !!data.bio && data.bio.length > 10,
          (data.goals > 0 || data.assists > 0 || data.appearances > 0),
          data.highlight_urls?.length > 0,
          !!data.status,
        ]
        const weights = [15, 10, 15, 10, 15, 15, 15, 5]
        const s = checks.reduce((sum, done, i) => sum + (done ? weights[i] : 0), 0)
        setScore(s)
        setStreak(data.streak_weeks ?? 0)
      })
  }, [userId])

  const color = score === null ? '#1e2235' : score === 100 ? '#4ade80' : score >= 60 ? '#2d5fc4' : '#f59e0b'

  return (
    <Link
      href="/dashboard/profile"
      className="rounded-xl p-4 flex items-center justify-between gap-4 transition-colors group"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none' }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#2d5fc4')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1e2235')}
    >
      <div className="space-y-1">
        <span
          className="text-sm font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
        >
          Profile Health
        </span>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span className="text-xs" style={{ color: '#8892aa' }}>🔥 {streak}-week streak</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <p className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color }}>
            {score ?? '—'}%
          </p>
          <p className="text-xs" style={{ color: '#8892aa' }}>complete</p>
        </div>
        <span style={{ color: '#8892aa' }}>→</span>
      </div>
    </Link>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardHome({
  role,
  userId,
  fullName,
  onSignOut,
}: {
  role: Role
  userId: string
  fullName: string | null
  onSignOut: () => void
}) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [leaderboard, setLeaderboard] = useState<PlayerCard[]>([])
  const [premiumPlayers, setPremiumPlayers] = useState<PlayerCard[]>([])
  const [newJoiners, setNewJoiners] = useState<NewJoiner[]>([])
  const [loadingOpps, setLoadingOpps] = useState(true)
  const [loadingBoard, setLoadingBoard] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    async function fetchAll() {
      // Latest 5 opportunities
      const { data: opps } = await supabase
        .from('opportunities')
        .select('id, title, club, location, position, level, created_at, coach:coach_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(5)
      setOpportunities((opps as unknown as Opportunity[]) ?? [])
      setLoadingOpps(false)

      // Top players by weekly views
      const { data: board } = await supabase
        .from('profiles')
        .select('id, full_name, position, club, avatar_url, weekly_views')
        .eq('role', 'player')
        .order('weekly_views', { ascending: false })
        .limit(5)
      setLeaderboard((board as PlayerCard[]) ?? [])
      setLoadingBoard(false)

      // Premium players for carousel
      const { data: premium } = await supabase
        .from('profiles')
        .select('id, full_name, position, club, avatar_url, weekly_views')
        .eq('role', 'player')
        .eq('premium', true)
        .eq('approved', true)
        .limit(20)
      setPremiumPlayers((premium as PlayerCard[]) ?? [])
    }

    fetchAll()
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Nav */}
      <header
        className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between"
        style={{ backgroundColor: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}
      >
        <img src="/logo.jpg" alt="NEXT11VEN" className="h-8 w-auto" />
        <div className="flex items-center gap-3">
          {role === 'player' && (
            <Link
              href="/dashboard/profile"
              className="text-xs uppercase tracking-wider px-4 py-2 rounded-full transition-colors"
              style={{ border: '1px solid #1e2235', color: '#8892aa' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#e8dece')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#8892aa')}
            >
              My Profile
            </Link>
          )}
          <button
            onClick={onSignOut}
            className="text-xs uppercase tracking-wider px-4 py-2 rounded-full transition-colors"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e8dece')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8892aa')}
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-10">
        {/* Welcome */}
        <div>
          <h1
            className="text-3xl font-extrabold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
          >
            Welcome{fullName ? `, ${fullName.split(' ')[0]}` : ' Back'}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#8892aa' }}>
            {role === 'coach'
              ? 'Scout and connect with non-league players.'
              : 'Your profile is live. Stay visible, stay available.'}
          </p>
        </div>

        {/* Premium Carousel */}
        <PremiumCarousel players={premiumPlayers} />

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <OpportunitiesSection opportunities={opportunities} loading={loadingOpps} />
          <LeaderboardSection players={leaderboard} loading={loadingBoard} />
        </div>

        {/* Player-only bottom row */}
        {role === 'player' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PlayerStatusWidget userId={userId} />
            <ProfileHealthWidget userId={userId} />
          </div>
        )}
      </main>
    </div>
  )
}
