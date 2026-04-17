'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useSidebar } from './_components/SidebarContext'
import { COMPLETION_CHECKS, calcCompletion } from '@/lib/profileCompletion'
import { getLevelConfig } from '@/lib/opportunityLevel'
import { timeAgo } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'free_agent' | 'signed' | 'loan_dual_reg' | 'just_exploring'

type Profile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
  status: Status | null
  premium: boolean
  position: string | null
  club: string | null
  city: string | null
  phone: string | null
  date_of_birth: string | null
  foot: string | null
  height: string | null
  playing_level: string | null
  highlight_urls: string[] | null
  bio: string | null
  goals: number
  assists: number
  appearances: number
}

type FeaturedPlayer = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  club: string | null
  city: string | null
  status: Status | null
}

type Opportunity = {
  id: string
  title: string
  club: string | null
  location: string | null
  position: string | null
  level: string | null
  urgent: boolean
  created_at: string
  coach: { full_name: string | null } | null
}

type NewJoiner = {
  id: string
  role: string | null
  full_name: string | null
  avatar_url: string | null
  position: string | null
  club: string | null
  status: Status | null
  coaching_role: string | null
}

const STATUS_LABELS: Record<Status, string> = {
  free_agent:    'Free Agent',
  signed:        'Signed to a club',
  loan_dual_reg: 'Looking for Loan / Dual Reg',
  just_exploring:'Just Exploring',
}

const STATUS_COLORS: Record<Status, string> = {
  free_agent:    '#60a5fa',
  signed:        '#8892aa',
  loan_dual_reg: '#a78bfa',
  just_exploring:'#f59e0b',
}

// ─── Profile Completion Bar ───────────────────────────────────────────────────

function ProfileCompletionBar({ profile }: { profile: Profile }) {
  const { pct, missing } = calcCompletion(profile)
  if (pct === 100) return null

  const barColor = pct < 40 ? '#f59e0b' : pct < 75 ? '#2d5fc4' : '#34d399'

  return (
    <Link href="/dashboard/profile" style={{ textDecoration: 'none' }}>
      <div className="mx-4 rounded-2xl px-4 py-3"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#e8dece' }}>
                Profile Completion
              </p>
              <span className="text-xs font-bold" style={{ color: barColor }}>{pct}%</span>
            </div>
            <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#1e2235' }}>
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
            </div>
          </div>
          <span className="text-xs font-semibold flex-shrink-0 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4', border: '1px solid rgba(45,95,196,0.3)' }}>
            Add missing info →
          </span>
        </div>
      </div>
    </Link>
  )
}

// ─── Quick Stats Bar ──────────────────────────────────────────────────────────

function QuickStatsBar({ views, unread, openOpps }: { views: number; unread: number; openOpps: number }) {
  const stats = [
    { label: 'Profile Views', value: views, href: '/dashboard/player/market?tab=activity', sub: 'this week' },
    { label: 'Messages', value: unread, href: '/dashboard/player/messages', sub: unread === 1 ? 'unread' : 'unread' },
    { label: 'Opportunities', value: openOpps, href: '/dashboard/player/market?tab=opportunities', sub: 'open' },
  ]
  return (
    <div className="mx-4 grid grid-cols-3 gap-2">
      {stats.map((s) => (
        <Link key={s.label} href={s.href}
          className="flex flex-col items-center justify-center rounded-2xl py-3 px-2 transition-colors"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none' }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#2d5fc4')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#1e2235')}>
          <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            {s.value}
          </span>
          <span className="text-xs mt-1 text-center leading-tight" style={{ color: '#8892aa' }}>{s.sub}</span>
          <span className="text-xs mt-0.5 text-center leading-tight font-semibold" style={{ color: '#8892aa', fontSize: 10 }}>{s.label}</span>
        </Link>
      ))}
    </div>
  )
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function SkeletonPulse({ h = 16, w = '100%', rounded = 'rounded-lg' }: { h?: number; w?: string | number; rounded?: string }) {
  return (
    <div className={`animate-pulse ${rounded}`}
      style={{ height: h, width: w, backgroundColor: '#1e2235' }} />
  )
}

function PlayerHomeSkeleton() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <header className="px-4 pt-6 pb-4 flex items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <SkeletonPulse h={3} w={22} rounded="rounded" />
          <SkeletonPulse h={3} w={16} rounded="rounded" />
          <SkeletonPulse h={3} w={22} rounded="rounded" />
        </div>
        <SkeletonPulse h={36} w={90} rounded="rounded-lg" />
        <div style={{ width: 22 }} />
      </header>
      <div className="px-4 pb-4"><SkeletonPulse h={14} w="60%" rounded="rounded-lg" /></div>
      <div className="mx-4 mb-4"><SkeletonPulse h={56} rounded="rounded-2xl" /></div>
      <div className="mx-4 grid grid-cols-3 gap-2 mb-6">
        {[0,1,2].map(i => <SkeletonPulse key={i} h={72} rounded="rounded-2xl" />)}
      </div>
      <div className="mx-4 space-y-3">
        <SkeletonPulse h={100} rounded="rounded-2xl" />
        <SkeletonPulse h={100} rounded="rounded-2xl" />
      </div>
    </div>
  )
}

// ─── Featured Players Carousel ────────────────────────────────────────────────

function FeaturedCarousel({ players }: { players: FeaturedPlayer[] }) {
  if (players.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="px-4">
        <h2 className="text-xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Featured Players ✓
        </h2>
        <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>Premium players appear first to clubs</p>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2" style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
        {players.map((p) => (
          <Link key={p.id} href={`/dashboard/player/players/${p.id}`}
            className="flex-shrink-0 rounded-2xl overflow-hidden block"
            style={{ width: 170, scrollSnapAlign: 'start', border: '1px solid #1e2235', textDecoration: 'none' }}>
            <div className="relative" style={{ height: 170, backgroundColor: '#1a1f3a' }}>
              {p.avatar_url ? (
                <img src={p.avatar_url} alt={p.full_name ?? ''} className="w-full h-full object-cover object-top" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(160deg, #13172a 0%, #0d1020 100%)' }}>
                  <span className="font-black text-5xl" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#1e2235' }}>
                    {p.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2) ?? '??'}
                  </span>
                </div>
              )}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.4) 0%, transparent 60%)' }} />
              <div className="absolute top-2 right-2">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(45,95,196,0.85)', color: '#fff', fontSize: 10 }}>PRO</span>
              </div>
            </div>
            <div className="p-3 space-y-0.5" style={{ backgroundColor: '#13172a' }}>
              <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{p.full_name ?? 'Player'}</p>
              <p className="text-xs truncate" style={{ color: '#8892aa' }}>{[p.position, p.city].filter(Boolean).join(' · ') || '—'}</p>
              {p.status && (
                <p className="text-xs font-semibold" style={{ color: STATUS_COLORS[p.status], fontSize: 10 }}>
                  {STATUS_LABELS[p.status]}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─── Opportunities Preview ────────────────────────────────────────────────────

function OpportunitiesPreview({ opportunities }: { opportunities: Opportunity[] }) {
  return (
    <section className="space-y-3 px-4">
      <h2 className="text-xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
        New Opportunities 🔥
      </h2>
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
        {opportunities.length === 0 ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm" style={{ color: '#8892aa' }}>No opportunities posted yet. Check back soon — coaches post new roles regularly.</p>
            <Link href="/dashboard/player/profile"
              className="inline-block px-4 py-2 rounded-xl text-xs font-bold"
              style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
              Update My Profile
            </Link>
          </div>
        ) : (
          opportunities.map((opp, i) => {
            const lvl = getLevelConfig(opp.level)
            return (
              <Link key={opp.id} href="/dashboard/player/market?tab=opportunities"
                className="flex items-center gap-3 px-4 py-3.5 transition-colors"
                style={{ backgroundColor: '#13172a', borderBottom: i < opportunities.length - 1 ? '1px solid #1e2235' : undefined, display: 'flex', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#161b30')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#13172a')}>
                {/* Level badge */}
                <div className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl px-2"
                  style={{ minWidth: 44, height: 44, backgroundColor: lvl.bg, border: `1px solid ${lvl.color}40` }}>
                  <span className="font-black leading-none" style={{ color: lvl.color, fontSize: 9, letterSpacing: '0.05em' }}>{lvl.line1}</span>
                  {lvl.line2 && <span className="font-black leading-none mt-0.5" style={{ color: lvl.color, fontSize: lvl.line2.length <= 2 ? 16 : 10 }}>{lvl.line2}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>
                    {opp.location ?? 'Location TBC'}{opp.urgent ? ' · 🔴 URGENT' : ''}
                  </p>
                  <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{opp.title}</p>
                  <p className="text-xs" style={{ color: '#8892aa' }}>{opp.position ?? 'All Positions'}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </Link>
            )
          })
        )}
      </div>
      <Link href="/dashboard/player/market?tab=opportunities"
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-bold uppercase tracking-wider transition-colors"
        style={{ backgroundColor: '#e8dece', color: '#0a0a0a', textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d4c8b8')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#e8dece')}>
        All Opportunities →
      </Link>
    </section>
  )
}

// ─── New Joiners ──────────────────────────────────────────────────────────────

function NewJoinersSection({ players }: { players: NewJoiner[] }) {
  if (players.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="px-4 flex items-center gap-2">
        <h2 className="text-xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          New to the Platform
        </h2>
        <span className="text-xs px-2 py-0.5 rounded-full font-bold"
          style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4' }}>
          {players.length}
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {players.map((p) => {
          const isCoach = p.role === 'coach'
          const subtitle = isCoach ? (p.coaching_role ?? p.club ?? '—') : (p.club ?? '—')
          const initials = p.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2) ?? '??'
          return (
            <Link key={p.id} href={`/dashboard/player/players/${p.id}`}
              className="flex-shrink-0 rounded-2xl overflow-hidden block"
              style={{ width: 170, scrollSnapAlign: 'start', border: '1px solid #1e2235', textDecoration: 'none' }}>
              <div className="relative" style={{ height: 170, backgroundColor: '#1a1f3a' }}>
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt={p.full_name ?? ''} className="w-full h-full object-cover object-top" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(160deg, #13172a 0%, #0d1020 100%)' }}>
                    <span className="font-black text-5xl" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#1e2235' }}>
                      {initials}
                    </span>
                  </div>
                )}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.4) 0%, transparent 60%)' }} />
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
              <div className="p-3 space-y-0.5" style={{ backgroundColor: '#13172a' }}>
                <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>
                  {p.full_name ?? (isCoach ? 'Coach' : 'Player')}
                </p>
                <p className="text-xs truncate" style={{ color: '#8892aa' }}>{subtitle}</p>
                {!isCoach && p.status && p.status !== 'signed' && (
                  <p className="text-xs font-semibold" style={{ color: STATUS_COLORS[p.status], fontSize: 10 }}>
                    {STATUS_LABELS[p.status]}
                  </p>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlayerHome() {
  const router = useRouter()
  const { openSidebar } = useSidebar()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [featuredPlayers, setFeaturedPlayers] = useState<FeaturedPlayer[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [newJoiners, setNewJoiners] = useState<NewJoiner[]>([])
  const [loading, setLoading] = useState(true)
  const [savingStatus, setSavingStatus] = useState(false)
  const [statsViews, setStatsViews] = useState(0)
  const [statsUnread, setStatsUnread] = useState(0)
  const [statsOpps, setStatsOpps] = useState(0)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

      const [profileRes, featuredRes, oppsRes, joinersRes, viewsRes, convsRes, oppsCountRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url, role, status, premium, position, club, city, phone, date_of_birth, foot, height, playing_level, highlight_urls, bio, goals, assists, appearances').eq('id', user.id).single(),
        supabase.from('profiles').select('id, full_name, avatar_url, position, club, city, status').in('role', ['player', 'admin']).eq('approved', true).eq('premium', true).limit(10),
        supabase.from('opportunities').select('id, title, club, location, position, level, urgent, created_at, coach:coach_id(full_name)').eq('is_active', true).order('created_at', { ascending: false }).limit(5),
        supabase.from('profiles').select('id, role, full_name, avatar_url, position, club, status, coaching_role').eq('approved', true).order('created_at', { ascending: false }).limit(30),
        // Profile views this week
        supabase.from('player_views').select('id', { count: 'exact', head: true }).eq('player_id', user.id).gte('viewed_at', weekAgo),
        // Unread messages
        supabase.from('conversations').select('id').eq('player_id', user.id),
        // Open opportunities count
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ])

      const profileData = profileRes.data as Profile
      setProfile(profileData)
      setFeaturedPlayers((featuredRes.data as FeaturedPlayer[]) ?? [])
      setOpportunities((oppsRes.data as unknown as Opportunity[]) ?? [])
      setNewJoiners((joinersRes.data as NewJoiner[]) ?? [])

      // Quick stats
      setStatsViews(viewsRes.count ?? 0)
      setStatsOpps(oppsCountRes.count ?? 0)
      // Count unread messages
      const convIds = (convsRes.data ?? []).map((c: { id: string }) => c.id)
      if (convIds.length > 0) {
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .neq('sender_id', user.id)
          .is('read_at', null)
        setStatsUnread(unreadCount ?? 0)
      }

      setLoading(false)

      // Auto-grant premium for existing Stripe subscribers who just claimed their account
      if (!profileData?.premium) {
        fetch('/api/stripe/sync', { method: 'POST' }).then(r => r.json()).then(d => {
          if (d.synced) setProfile(p => p ? { ...p, premium: true } : p)
        }).catch(() => {})
      }
    }
    load()
  }, [])

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value as Status
    if (!profile) return
    setSavingStatus(true)
    const supabase = createClient()
    await supabase.from('profiles').update({ status: val }).eq('id', profile.id)
    setProfile(p => p ? { ...p, status: val } : p)
    setSavingStatus(false)
  }

  if (loading) return <PlayerHomeSkeleton />

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <header className="px-4 pt-6 pb-4 flex items-center justify-between">
        <button onClick={openSidebar} className="flex flex-col gap-1.5" style={{ width: 22 }}>
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 22 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 16 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 22 }} />
        </button>
        <img src="/logo.jpg" alt="NEXT11VEN" className="h-9 w-auto" />
        <div style={{ width: 22 }} />
      </header>

      {/* Welcome */}
      <div className="px-4 pb-3 text-center">
        <p className="text-base" style={{ color: '#8892aa' }}>
          Welcome back,{' '}
          <span className="font-semibold" style={{ color: '#e8dece' }}>{profile?.full_name ?? 'Player'}</span> ✓
        </p>
      </div>

      {/* Profile Completion — not shown for fans */}
      {profile && profile.role !== 'fan' && <div className="pb-4"><ProfileCompletionBar profile={profile} /></div>}

      {/* Quick Stats */}
      {profile?.role !== 'fan' && (
        <div className="pb-5">
          <QuickStatsBar views={statsViews} unread={statsUnread} openOpps={statsOpps} />
        </div>
      )}

      <div className="space-y-7 pb-6">

        {/* Announcement + Availability — side by side on sm+ */}
        <section className="px-4">
          <div className={`grid gap-3 items-stretch ${profile?.role === 'fan' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>

            {/* Announcement Banner */}
            <div className="rounded-2xl p-4 flex flex-col justify-between gap-3"
              style={{ background: 'linear-gradient(135deg, #0d1a3a 0%, #13172a 100%)', border: '1px solid #2d5fc4' }}>
              <p className="text-sm leading-relaxed" style={{ color: '#e8dece' }}>
                🏆 <strong>End of Season Showcase Day</strong>
                <br />
                Get seen by coaches at your level.
                <br />
                <span style={{ color: '#60a5fa' }}>Step 3–7 coaches registered.</span>
              </p>
              <a
                href="https://forms.gle/e4goiHZxEutBFGup8"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl py-2 text-xs font-bold uppercase tracking-wider text-center block"
                style={{ backgroundColor: '#e8dece', color: '#0a0a0a' }}>
                Register Interest
              </a>
            </div>

            {/* Availability — hidden for fans */}
            {profile?.role !== 'fan' && (
              <div className="rounded-2xl p-4 flex flex-col justify-between gap-3"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>👉 Your availability:</p>
                  {!profile?.status && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>Required</span>
                  )}
                </div>
                <select
                  value={profile?.status ?? ''}
                  onChange={handleStatusChange}
                  disabled={savingStatus}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer"
                  style={{
                    backgroundColor: '#0d1020',
                    border: `1px solid ${profile?.status ? STATUS_COLORS[profile.status] : '#1e2235'}`,
                    color: '#e8dece',
                  }}>
                  <option value="" disabled style={{ backgroundColor: '#0d1020', color: '#8892aa' }}>Select status…</option>
                  <option value="free_agent" style={{ backgroundColor: '#0d1020', color: '#e8dece' }}>Free Agent</option>
                  <option value="signed" style={{ backgroundColor: '#0d1020', color: '#e8dece' }}>Signed to a club</option>
                  <option value="loan_dual_reg" style={{ backgroundColor: '#0d1020', color: '#e8dece' }}>Looking for Loan / Dual Reg</option>
                  <option value="just_exploring" style={{ backgroundColor: '#0d1020', color: '#e8dece' }}>Just Exploring</option>
                </select>
              </div>
            )}

          </div>
        </section>

        {/* Featured Players */}
        <FeaturedCarousel players={featuredPlayers} />

        {/* Opportunities */}
        <OpportunitiesPreview opportunities={opportunities} />

        {/* New Joiners */}
        <NewJoinersSection players={newJoiners} />

      </div>
    </div>
  )
}
