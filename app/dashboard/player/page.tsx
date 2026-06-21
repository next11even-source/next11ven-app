'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useSidebar } from './_components/SidebarContext'
import { COMPLETION_CHECKS, calcCompletion } from '@/lib/profileCompletion'
import { LevelBadge, ClubCrest } from '@/app/components/OpportunityBadges'
import NewBadge from '@/app/components/NewBadge'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'free_agent' | 'signed' | 'loan_dual_reg' | 'just_exploring'

type Profile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
  status: Status | null
  premium: boolean
  actively_looking: boolean
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
  actively_looking: boolean
  premium: boolean
  created_at: string | null
}

type ActiveUser = {
  id: string
  role: string | null
  full_name: string | null
  avatar_url: string | null
  position: string | null
  playing_level: string | null
  coaching_role: string | null
  coaching_level: string | null
  club: string | null
  city: string | null
  status: Status | null
  premium: boolean
  actively_looking: boolean
  last_active: string | null
  created_at: string | null
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

type FeedPost = {
  id: string
  post_type: string
  caption: string
  image_url: string | null
  created_at: string
  author: {
    full_name: string | null
    avatar_url: string | null
    role: string | null
    position: string | null
    location: string | null
  } | null
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
      <div className="mx-4 rounded-2xl px-4 py-2.5"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#e8dece' }}>
                Profile Completion
              </p>
              <span className="text-xs font-bold" style={{ color: barColor }}>{pct}%</span>
            </div>
            <div className="w-full rounded-full h-1" style={{ backgroundColor: '#1e2235' }}>
              <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
            </div>
          </div>
          <span className="text-xs font-semibold flex-shrink-0 px-3 py-1 rounded-full"
            style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4', border: '1px solid rgba(45,95,196,0.3)' }}>
            Complete →
          </span>
        </div>
      </div>
    </Link>
  )
}

// ─── Quick Stats Bar ──────────────────────────────────────────────────────────

function QuickStatsBar({ views, openOpps }: { views: number; openOpps: number }) {
  const stats = [
    {
      label: 'Profile Views', value: views, href: '/dashboard/player/activity', sub: 'this week',
      color: '#2d5fc4', bg: 'rgba(45,95,196,0.07)', border: 'rgba(45,95,196,0.5)',
    },
    {
      label: 'Opportunities', value: openOpps, href: '/dashboard/opportunities', sub: 'open',
      color: '#f59e0b', bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.4)',
    },
  ]
  return (
    <div className="mx-4 grid grid-cols-3 gap-3">
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
      <Link href="/dashboard/showcase"
        className="flex flex-col items-center justify-center rounded-2xl py-3 px-2 transition-all"
        style={{ backgroundColor: 'rgba(45,95,196,0.07)', border: '1.5px solid rgba(45,95,196,0.5)', textDecoration: 'none' }}
        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#2d5fc4')}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(45,95,196,0.5)')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
        </svg>
        <span className="text-xs mt-1 text-center leading-tight font-semibold" style={{ color: '#e8dece', fontSize: 10 }}>Showcase Games</span>
        <span className="text-xs mt-0.5 text-center leading-tight" style={{ color: '#8892aa' }}>sold out</span>
      </Link>
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

// ─── Recently Active ──────────────────────────────────────────────────────────

function ActiveUserCard({ user }: { user: ActiveUser }) {
  const isCoach = user.role === 'coach'
  const initials = user.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  // Homepage only needs account type + step level (not exact role)
  const accountType = isCoach ? 'Coach' : 'Player'
  const level = isCoach ? user.coaching_level : user.playing_level
  const href = isCoach ? `/dashboard/coach/${user.id}` : `/dashboard/player/players/${user.id}`

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2.5 mr-2.5 rounded-xl flex-shrink-0"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none', width: 230 }}
    >
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: '#1a1f3a' }}>
          {user.avatar_url
            ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover object-center" />
            : <span className="text-sm font-black" style={{ color: isCoach ? '#a78bfa' : '#60a5fa' }}>{initials}</span>}
        </div>
        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full"
          style={{ backgroundColor: '#3a6fda', border: '2px solid #13172a' }} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>
            {user.full_name ?? (isCoach ? 'Coach' : 'Player')}
          </p>
          {!isCoach && user.premium && <span className="flex-shrink-0" style={{ color: '#f59e0b', fontSize: 11 }}>★</span>}
          <NewBadge createdAt={user.created_at} size="sm" />
        </div>
        <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>
          {accountType}{level ? ` · ${level}` : ''}
        </p>
      </div>
    </Link>
  )
}

function RecentlyActiveSection({ users }: { users: ActiveUser[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const interactingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const animate = users.length >= 3
  const loop = animate ? [...users, ...users] : users

  useEffect(() => {
    if (!animate) return
    const el = scrollRef.current
    if (!el) return

    // JS accumulator avoids mobile integer-rounding of scrollLeft
    let pos = 0

    function startInteract() {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      interactingRef.current = true
    }
    function scheduleResume() {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = setTimeout(() => { interactingRef.current = false }, 2000)
    }
    function onScroll() {
      // Only reset the resume timer for user-initiated scroll, not our own auto-scroll
      if (interactingRef.current) scheduleResume()
    }

    el.addEventListener('touchstart', startInteract, { passive: true })
    el.addEventListener('touchend', scheduleResume, { passive: true })
    el.addEventListener('touchcancel', scheduleResume, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('mouseenter', startInteract)
    el.addEventListener('mouseleave', scheduleResume)
    el.addEventListener('pointerdown', startInteract)
    el.addEventListener('pointerup', scheduleResume)

    function tick() {
      if (el) {
        if (interactingRef.current) {
          pos = el.scrollLeft
        } else {
          const half = el.scrollWidth / 2
          pos += 0.5
          if (half > 0 && pos >= half) pos -= half
          el.scrollLeft = pos
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      el.removeEventListener('touchstart', startInteract)
      el.removeEventListener('touchend', scheduleResume)
      el.removeEventListener('touchcancel', scheduleResume)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('mouseenter', startInteract)
      el.removeEventListener('mouseleave', scheduleResume)
      el.removeEventListener('pointerdown', startInteract)
      el.removeEventListener('pointerup', scheduleResume)
    }
  }, [animate])

  if (users.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5 px-4">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: '#2d5fc4', animation: 'n11-ping 1.6s cubic-bezier(0,0,0.2,1) infinite' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#3a6fda' }} />
        </span>
        <h2 className="text-xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Recently Active
        </h2>
      </div>

      {animate ? (
        <div ref={scrollRef} className="flex overflow-x-auto pl-4 pb-1" style={{ scrollbarWidth: 'none' }}>
          {loop.map((u, i) => <ActiveUserCard key={`${u.id}-${i}`} user={u} />)}
        </div>
      ) : (
        <div className="flex overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
          {users.map(u => <ActiveUserCard key={u.id} user={u} />)}
        </div>
      )}

      <style jsx>{`
        @keyframes n11-ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </section>
  )
}

// ─── Featured Players Carousel ────────────────────────────────────────────────

function FeaturedPlayerCard({ p }: { p: FeaturedPlayer }) {
  const isLooking = p.actively_looking
  return (
    <Link href={`/dashboard/player/players/${p.id}`}
      className="flex-shrink-0 rounded-2xl overflow-hidden block mr-3"
      style={{
        width: 145,
        border: `1px solid ${isLooking ? 'rgba(34,197,94,0.4)' : '#1e2235'}`,
        textDecoration: 'none',
        boxShadow: isLooking ? '0 0 20px rgba(34,197,94,0.1)' : 'none',
      }}>
      <div className="relative" style={{ height: 145, backgroundColor: '#1a1f3a' }}>
        {p.avatar_url ? (
          <img src={p.avatar_url} alt={p.full_name ?? ''} className="w-full h-full object-cover object-center" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(160deg, #13172a 0%, #0d1020 100%)' }}>
            <span className="font-black text-5xl" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#1e2235' }}>
              {p.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2) ?? '??'}
            </span>
          </div>
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.4) 0%, transparent 60%)' }} />
        <div className="absolute top-2 left-2">
          <NewBadge createdAt={p.created_at} size="sm" />
        </div>
        {isLooking && (
          <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ backgroundColor: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.7)' }} />
        )}
      </div>
      <div className="p-3 space-y-0.5" style={{ backgroundColor: '#13172a' }}>
        <p className="text-sm font-bold truncate flex items-center gap-1" style={{ color: '#e8dece' }}>
          <span className="truncate">{p.full_name ?? 'Player'}</span>
          <span className="flex-shrink-0" style={{ color: '#f59e0b', fontSize: 12 }}>★</span>
        </p>
        <p className="text-xs truncate" style={{ color: '#8892aa' }}>{[p.position, p.city].filter(Boolean).join(' · ') || '—'}</p>
        {isLooking ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: '#22c55e', fontSize: 10 }}>
            <span className="animate-pulse" style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
            Actively Looking
          </span>
        ) : p.status && (
          <p className="text-xs font-semibold" style={{ color: STATUS_COLORS[p.status] ?? '#8892aa', fontSize: 10 }}>
            {STATUS_LABELS[p.status]}
          </p>
        )}
      </div>
    </Link>
  )
}

function FeaturedCarousel({ players, viewerPremium, viewerLooking }: {
  players: FeaturedPlayer[]
  viewerPremium: boolean
  viewerLooking: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const interactingRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (players.length === 0) return null

  const showCta = !viewerPremium || !viewerLooking
  const ctaHref = !viewerPremium ? '/dashboard/player/premium' : '#'

  const animate = players.length >= 3
  const loop = animate ? [...players, ...players] : players

  useEffect(() => {
    if (!animate) return
    const el = scrollRef.current
    if (!el) return

    let pos = 0

    function startInteract() {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      interactingRef.current = true
    }
    function scheduleResume() {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = setTimeout(() => { interactingRef.current = false }, 2000)
    }
    function onScroll() {
      if (interactingRef.current) scheduleResume()
    }

    el.addEventListener('touchstart', startInteract, { passive: true })
    el.addEventListener('touchend', scheduleResume, { passive: true })
    el.addEventListener('touchcancel', scheduleResume, { passive: true })
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('mouseenter', startInteract)
    el.addEventListener('mouseleave', scheduleResume)
    el.addEventListener('pointerdown', startInteract)
    el.addEventListener('pointerup', scheduleResume)

    function tick() {
      if (el) {
        if (interactingRef.current) {
          pos = el.scrollLeft
        } else {
          const half = el.scrollWidth / 2
          pos += 0.5
          if (half > 0 && pos >= half) pos -= half
          el.scrollLeft = pos
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      el.removeEventListener('touchstart', startInteract)
      el.removeEventListener('touchend', scheduleResume)
      el.removeEventListener('touchcancel', scheduleResume)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('mouseenter', startInteract)
      el.removeEventListener('mouseleave', scheduleResume)
      el.removeEventListener('pointerdown', startInteract)
      el.removeEventListener('pointerup', scheduleResume)
    }
  }, [animate])

  return (
    <section className="space-y-3">
      <div className="px-4">
        <h2 className="text-xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Featured Players
        </h2>
        <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>Pro players · actively looking players get extra visibility</p>
      </div>
      <div ref={scrollRef} className="flex overflow-x-auto pl-4 pb-2" style={{ scrollbarWidth: 'none' }}>
        {showCta && (
          <Link href={ctaHref}
            className="flex-shrink-0 rounded-2xl overflow-hidden flex flex-col items-center justify-center text-center px-4 mr-3"
            style={{
              width: 145,
              minHeight: 210,
              border: '1px dashed rgba(34,197,94,0.4)',
              textDecoration: 'none',
              background: 'linear-gradient(160deg, rgba(34,197,94,0.06) 0%, #13172a 100%)',
            }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
              style={{ backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)' }}>
              <span className="animate-pulse" style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#22c55e', display: 'block', boxShadow: '0 0 10px rgba(34,197,94,0.6)' }} />
            </div>
            <p className="text-xs font-bold uppercase leading-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', letterSpacing: '0.04em' }}>
              {!viewerPremium ? 'Want to be here?' : 'Stand out more'}
            </p>
            <p className="text-xs mt-1.5 leading-snug" style={{ color: '#8892aa', fontSize: 10 }}>
              {!viewerPremium
                ? 'Premium players get featured to every coach on the platform.'
                : 'Turn on Actively Looking to get the green signal coaches look for.'}
            </p>
            <span className="mt-3 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
              style={{ backgroundColor: !viewerPremium ? '#2d5fc4' : '#22c55e', color: '#fff', fontSize: 10 }}>
              {!viewerPremium ? 'Go Premium' : 'Enable Now'}
            </span>
          </Link>
        )}
        {loop.map((p, i) => <FeaturedPlayerCard key={`${p.id}-${i}`} p={p} />)}
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
            const meta = [opp.location, opp.position].filter(Boolean).join(' · ')
            return (
              <Link key={opp.id} href="/dashboard/opportunities"
                className="relative flex items-center gap-3 px-4 py-3.5 transition-colors"
                style={{ backgroundColor: '#13172a', borderBottom: i < opportunities.length - 1 ? '1px solid #1e2235' : undefined, display: 'flex', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#161b30')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#13172a')}>
                {opp.urgent && <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, backgroundColor: '#ef4444' }} />}
                <LevelBadge level={opp.level} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <ClubCrest club={null} />
                    <h3 className="font-bold uppercase truncate"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', fontSize: 17, lineHeight: 1.1 }}>
                      {opp.title}
                    </h3>
                  </div>
                  <p className="text-xs mt-1 truncate" style={{ color: '#8892aa' }}>{meta || 'Details to follow'}</p>
                  {opp.urgent && <p className="text-xs mt-0.5 font-semibold" style={{ color: '#f87171' }}>🔴 Urgent</p>}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
              </Link>
            )
          })
        )}
      </div>
      <Link href="/dashboard/opportunities"
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-bold uppercase tracking-wider transition-colors"
        style={{ backgroundColor: '#e8dece', color: '#0a0a0a', textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d4c8b8')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#e8dece')}>
        All Opportunities →
      </Link>
    </section>
  )
}

// ─── Feed Preview ─────────────────────────────────────────────────────────────

const FEED_TYPE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  highlight:        { bg: '#2d5fc422', color: '#4d8ae8', label: 'HIGHLIGHT' },
  looking_for_club: { bg: '#f59e0b22', color: '#f59e0b', label: 'LOOKING FOR CLUB' },
  season_review:    { bg: '#7c3aed22', color: '#a78bfa', label: 'SEASON REVIEW' },
  general:          { bg: '#37415130', color: '#9ca3af', label: 'GENERAL' },
}

function FeedPreviewSection({ posts }: { posts: FeedPost[] }) {
  if (posts.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="px-4 flex items-center justify-between">
        <h2 className="text-xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          From the Feed
        </h2>
        <Link href="/dashboard/feed" className="text-xs font-semibold" style={{ color: '#2d5fc4', textDecoration: 'none' }}>
          See all →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2" style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
        {posts.map((post) => {
          const typeStyle = FEED_TYPE_STYLE[post.post_type] ?? FEED_TYPE_STYLE.general
          const author = post.author
          const initials = author?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2) ?? '??'

          return (
            <Link
              key={post.id}
              href="/dashboard/feed"
              className="flex-shrink-0 rounded-2xl overflow-hidden flex flex-col"
              style={{ width: 170, scrollSnapAlign: 'start', border: '1px solid #1e2235', backgroundColor: '#13172a', textDecoration: 'none' }}
            >
              {/* Image or gradient placeholder */}
              <div className="relative flex-shrink-0" style={{ height: 120, backgroundColor: '#0d1020' }}>
                {post.image_url ? (
                  <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #0d1a3a 0%, #13172a 100%)' }}>
                    <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, fontWeight: 900, color: '#1e2235' }}>
                      {initials}
                    </span>
                  </div>
                )}
                {/* Post type badge */}
                <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-bold"
                  style={{ backgroundColor: typeStyle.bg, color: typeStyle.color, fontFamily: "'Barlow Condensed', sans-serif", fontSize: 9, letterSpacing: '0.04em', backdropFilter: 'blur(4px)' }}>
                  {typeStyle.label}
                </span>
              </div>

              {/* Content */}
              <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                {/* Author */}
                <div className="flex items-center gap-1.5">
                  {author?.avatar_url ? (
                    <img src={author.avatar_url} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: '#1e2235', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 8, fontWeight: 700, color: '#8892aa' }}>{initials}</span>
                    </div>
                  )}
                  <span className="text-xs font-semibold truncate" style={{ color: '#e8dece', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12 }}>
                    {author?.full_name ?? 'Unknown'}
                  </span>
                </div>

                {/* Caption */}
                <p className="text-xs leading-snug" style={{
                  color: '#8892aa',
                  fontFamily: "'Inter', sans-serif",
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {post.caption}
                </p>
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
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingLooking, setSavingLooking] = useState(false)
  const [showLookingPaywall, setShowLookingPaywall] = useState(false)
  const [nearbyCoachCount, setNearbyCoachCount] = useState<number | null>(null)
  const [statsViews, setStatsViews] = useState(0)
  const [statsOpps, setStatsOpps] = useState(0)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()

      const [profileRes, featuredRes, activeRes, oppsRes, viewsRes, convsRes, oppsCountRes, feedRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url, role, status, premium, actively_looking, position, club, city, phone, date_of_birth, foot, height, playing_level, highlight_urls, bio, goals, assists, appearances').eq('id', user.id).single(),
        supabase.from('profiles').select('id, full_name, avatar_url, position, club, city, status, actively_looking, premium, created_at').in('role', ['player', 'admin']).eq('approved', true).eq('premium', true).not('avatar_url', 'is', null).neq('avatar_url', ''),
        // Recently active players + coaches
        supabase.from('profiles').select('id, role, full_name, avatar_url, position, playing_level, coaching_role, coaching_level, club, city, status, premium, actively_looking, last_active, created_at').in('role', ['player', 'admin', 'coach']).eq('approved', true).not('last_active', 'is', null).gte('last_active', twoWeeksAgo).order('last_active', { ascending: false }).limit(20),
        supabase.from('opportunities').select('id, title, club, location, position, level, urgent, created_at, coach:coach_id(full_name)').eq('is_active', true).order('created_at', { ascending: false }).limit(5),
        // Profile views this week
        supabase.from('player_views').select('id', { count: 'exact', head: true }).eq('player_id', user.id).gte('viewed_at', weekAgo),
        // Unread messages
        supabase.from('conversations').select('id').eq('player_id', user.id),
        // Open opportunities count
        supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_active', true),
        // Feed preview — show enough cards to scroll through
        supabase.from('posts').select('id, post_type, caption, image_url, created_at, author:profiles!author_id(full_name, avatar_url, role, position, location)').eq('is_deleted', false).order('created_at', { ascending: false }).limit(15),
      ])

      const profileData = profileRes.data as Profile
      setProfile(profileData)
      setFeaturedPlayers(((featuredRes.data as FeaturedPlayer[]) ?? []).sort(() => Math.random() - 0.5).slice(0, 10))
      setActiveUsers(((activeRes.data as ActiveUser[]) ?? []).filter(u => u.id !== user.id))
      setOpportunities((oppsRes.data as unknown as Opportunity[]) ?? [])
      const rawFeed = (feedRes.data as any[]) ?? []
      setFeedPosts(rawFeed.map(p => ({
        ...p,
        author: Array.isArray(p.author) ? (p.author[0] ?? null) : p.author,
      })))

      // Quick stats
      setStatsViews(viewsRes.count ?? 0)
      setStatsOpps(oppsCountRes.count ?? 0)
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

  async function handleActivelyLookingToggle() {
    if (!profile) return
    if (!profile.premium) {
      fetch('/api/player/actively-looking').then(r => r.json()).then(d => {
        setNearbyCoachCount(d.nearbyCoachCount ?? null)
      }).catch(() => {})
      setShowLookingPaywall(true)
      return
    }
    setSavingLooking(true)
    const next = !profile.actively_looking
    const res = await fetch('/api/player/actively-looking', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actively_looking: next }),
    })
    if (res.ok) setProfile(p => p ? { ...p, actively_looking: next } : p)
    setSavingLooking(false)
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
          <span className="font-semibold" style={{ color: '#e8dece' }}>{profile?.full_name ?? 'Player'}</span>
        </p>
      </div>

      {/* Profile Completion — not shown for fans */}
      {profile && profile.role !== 'fan' && <div className="pb-4"><ProfileCompletionBar profile={profile} /></div>}

      {/* Recently Active — players + coaches */}
      <div className="pb-4">
        <RecentlyActiveSection users={activeUsers} />
      </div>

      {/* Quick Stats */}
      {profile?.role !== 'fan' && (
        <div className="pb-5">
          <QuickStatsBar views={statsViews} openOpps={statsOpps} />
        </div>
      )}

      <div className="space-y-7 pb-6">

        {/* Availability */}
        <section className="px-4">
          <div className="grid gap-3 items-stretch grid-cols-1">

            {/* Availability — hidden for fans */}
            {profile?.role !== 'fan' && (
              <div className="rounded-2xl p-4"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <div className="flex gap-4">
                  {/* Left — status dropdown */}
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
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

                  {/* Right — Actively Looking toggle */}
                  <div className="flex flex-col items-center justify-center gap-2 flex-shrink-0"
                    style={{ borderLeft: '1px solid #1e2235', paddingLeft: 16, minWidth: 90 }}>
                    <div className="flex items-center gap-1.5">
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: profile?.actively_looking ? '#22c55e' : '#3a4055', boxShadow: profile?.actively_looking ? '0 0 10px rgba(34,197,94,0.6)' : 'none' }}
                        className={profile?.actively_looking ? 'animate-pulse' : ''} />
                      <span className="text-xs font-semibold whitespace-nowrap" style={{ color: profile?.actively_looking ? '#e8dece' : '#8892aa' }}>
                        Actively Looking
                      </span>
                    </div>
                    {!profile?.premium && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4' }}>Pro</span>
                    )}
                    <button
                      onClick={handleActivelyLookingToggle}
                      disabled={savingLooking}
                      className="relative rounded-full transition-colors"
                      style={{ width: 44, height: 24, backgroundColor: profile?.actively_looking ? '#22c55e' : '#1e2235' }}>
                      <span className="absolute top-1 rounded-full transition-all" style={{ width: 16, height: 16, backgroundColor: '#fff', left: profile?.actively_looking ? 24 : 4 }} />
                    </button>
                    <p className="text-center leading-tight" style={{ color: '#8892aa', fontSize: 10 }}>
                      Let coaches know you&apos;re actively looking
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>
        </section>

        {/* Feed Preview */}
        <FeedPreviewSection posts={feedPosts} />

        {/* Opportunities */}
        <OpportunitiesPreview opportunities={opportunities} />

        {/* Featured Players */}
        <FeaturedCarousel players={featuredPlayers} viewerPremium={profile?.premium ?? false} viewerLooking={profile?.actively_looking ?? false} />

      </div>

      {/* Actively Looking Paywall */}
      {showLookingPaywall && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-md mx-4 rounded-t-2xl sm:rounded-2xl p-6 space-y-5"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(45,95,196,0.15)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="3" />
                  <line x1="12" y1="2" x2="12" y2="5" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="5" y2="12" />
                  <line x1="19" y1="12" x2="22" y2="12" />
                </svg>
              </div>
              <h2 className="text-lg font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', letterSpacing: '0.04em' }}>
                This is how coaches find you
              </h2>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
              Switch on Actively Looking and you&apos;ll appear in the Actively Looking carousel and free-agent searches — the players coaches see first.
            </p>

            <p className="text-sm font-medium" style={{ color: '#e8dece' }}>
              {nearbyCoachCount
                ? `${nearbyCoachCount} coach${nearbyCoachCount > 1 ? 'es' : ''} recruiting your position near you this week.`
                : 'Coaches check the Actively Looking carousel every day.'}
            </p>

            <div className="space-y-2">
              {['Appear in the Actively Looking carousel & searches', 'See who\'s viewed and shortlisted you', 'Message coaches directly'].map(b => (
                <div key={b} className="flex items-center gap-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-sm" style={{ color: '#e8dece' }}>{b}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-1">
              <Link href="/dashboard/player/premium"
                className="block w-full text-center py-3 rounded-xl text-sm font-bold"
                style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                Go Premium &middot; £6.99/mo
              </Link>
              <button onClick={() => setShowLookingPaywall(false)}
                className="w-full text-center py-2 text-sm"
                style={{ color: '#8892aa' }}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
