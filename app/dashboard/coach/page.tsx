'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import CoachSidebar from './_components/CoachSidebar'
import { calcCoachCompletion, CoachCompletionProfile } from '@/lib/profileCompletion'
import { LevelBadge, ClubCrest } from '@/app/components/OpportunityBadges'
import NewBadge from '@/app/components/NewBadge'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'free_agent' | 'signed' | 'loan_dual_reg' | 'just_exploring'

type PremiumPlayer = {
  id: string
  full_name: string | null
  position: string | null
  avatar_url: string | null
  status: Status | null
  location: string | null
  city: string | null
  premium: boolean
}

type FeedPost = {
  id: string
  post_type: string
  caption: string
  image_url: string | null
  author: {
    full_name: string | null
    avatar_url: string | null
    role: string | null
  } | null
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
  last_active: string | null
  created_at: string | null
}

type RecentOpportunity = {
  id: string
  title: string
  club: string | null
  position: string | null
  level: string | null
  location: string | null
  is_active: boolean
  created_at: string
  isMine: boolean
  applicationCount: number
}

type ShortlistPlayer = {
  savedId: string
  player_id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  city: string | null
  location: string | null
  status: Status | null
  updated_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  free_agent:    { label: 'Free Agent',          color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  signed:        { label: 'Signed',              color: '#8892aa', bg: 'rgba(136,146,170,0.1)' },
  loan_dual_reg: { label: 'Loan / Dual Reg',     color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  just_exploring:{ label: 'Just Exploring',      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}

const POST_TYPE_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  highlight:        { bg: '#2d5fc422', color: '#4d8ae8', label: 'HIGHLIGHT' },
  looking_for_club: { bg: '#f59e0b22', color: '#f59e0b', label: 'LOOKING FOR CLUB' },
  season_review:    { bg: '#7c3aed22', color: '#a78bfa', label: 'SEASON REVIEW' },
  general:          { bg: '#37415130', color: '#9ca3af', label: 'GENERAL' },
}

function getInitials(name: string | null) {
  return name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
}

function Avatar({ name, url, size = 40 }: { name: string | null; url: string | null; size?: number }) {
  if (url) {
    return (
      <img src={url} alt={name ?? ''} className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }} />
    )
  }
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 font-bold"
      style={{ width: size, height: size, backgroundColor: '#1e2235', color: '#8892aa', fontSize: Math.max(size * 0.35, 10) }}>
      {getInitials(name)}
    </div>
  )
}

// ─── Coach Profile Completion Bar ────────────────────────────────────────────

function CoachProfileCompletionBar({ profile }: { profile: CoachCompletionProfile }) {
  const { pct, missing } = calcCoachCompletion(profile)
  if (pct === 100) return null

  const barColor = pct < 40 ? '#f59e0b' : pct < 75 ? '#2d5fc4' : '#34d399'

  return (
    <Link href="/dashboard/profile" className="block h-full" style={{ textDecoration: 'none' }}>
      <div className="rounded-2xl px-4 py-2.5 h-full"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <div className="flex items-center gap-3 h-full">
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

// ─── Section 1: Stats Row ─────────────────────────────────────────────────────

function CoachQuickStats({ newApps, lookingForClub, unread }: {
  newApps: number
  lookingForClub: number
  unread: number
}) {
  const stats = [
    {
      label: 'New Applications',
      value: newApps,
      href: '/dashboard/opportunities',
      sub: 'this week',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.07)',
      border: 'rgba(245,158,11,0.35)',
    },
    {
      label: 'Players Available',
      value: lookingForClub,
      href: '/dashboard/coach/players',
      sub: 'right now',
      color: '#fbbf24',
      bg: 'rgba(251,191,36,0.07)',
      border: 'rgba(251,191,36,0.35)',
    },
    {
      label: 'Unread Messages',
      value: unread,
      href: '/dashboard/coach/messages',
      sub: 'unread',
      color: '#a78bfa',
      bg: 'rgba(167,139,250,0.07)',
      border: 'rgba(167,139,250,0.4)',
    },
  ]
  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map(s => (
        <Link key={s.label} href={s.href}
          className="flex flex-col items-center justify-center rounded-2xl py-3 px-2"
          style={{ backgroundColor: s.bg, border: `1.5px solid ${s.border}`, textDecoration: 'none' }}>
          <span className="text-2xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: s.color }}>
            {s.value}
          </span>
          <span className="text-xs mt-1 text-center leading-tight font-semibold" style={{ color: '#e8dece', fontSize: 10 }}>{s.label}</span>
          <span className="text-xs mt-0.5 text-center leading-tight" style={{ color: '#8892aa', fontSize: 10 }}>{s.sub}</span>
        </Link>
      ))}
    </div>
  )
}

// ─── Section 2: From the Feed ─────────────────────────────────────────────────

function FeedPreview({ posts }: { posts: FeedPost[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          From the Feed
        </h2>
        <Link href="/dashboard/feed" className="text-xs font-semibold"
          style={{ color: '#2d5fc4', textDecoration: 'none' }}>
          See all →
        </Link>
      </div>

      {posts.length === 0 ? (
        <div className="rounded-xl px-5 py-6 text-center"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>No posts yet — check back soon.</p>
          <Link href="/dashboard/feed" className="mt-3 inline-block text-xs font-semibold"
            style={{ color: '#2d5fc4', textDecoration: 'none' }}>
            Visit the feed →
          </Link>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-4"
          style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
          {posts.map(post => {
            const typeStyle = POST_TYPE_STYLE[post.post_type] ?? POST_TYPE_STYLE.general
            const authorRole = post.author?.role ?? 'player'
            const roleIsCoach = authorRole === 'coach'
            return (
              <Link key={post.id} href="/dashboard/feed"
                className="flex-shrink-0 rounded-2xl overflow-hidden block"
                style={{ width: 170, scrollSnapAlign: 'start', border: '1px solid #1e2235', textDecoration: 'none', backgroundColor: '#13172a' }}>
                {/* Thumbnail */}
                <div className="relative" style={{ height: 120, backgroundColor: '#1a1f3a' }}>
                  {post.image_url ? (
                    <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(160deg, #13172a 0%, #0d1020 100%)' }}>
                      <span className="font-black text-4xl"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#1e2235' }}>
                        {getInitials(post.author?.full_name ?? null)}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.5) 0%, transparent 60%)' }} />
                  <div className="absolute top-2 left-2">
                    <span className="font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: typeStyle.bg, color: typeStyle.color, fontSize: 9, letterSpacing: '0.04em' }}>
                      {typeStyle.label}
                    </span>
                  </div>
                </div>
                {/* Body */}
                <div className="p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Avatar name={post.author?.full_name ?? null} url={post.author?.avatar_url ?? null} size={20} />
                    <span className="text-xs font-bold truncate"
                      style={{ color: '#e8dece', fontFamily: "'Barlow Condensed', sans-serif", fontSize: 12 }}>
                      {post.author?.full_name ?? 'Unknown'}
                    </span>
                    <span className="flex-shrink-0 px-1 py-0.5 rounded font-bold"
                      style={{
                        backgroundColor: roleIsCoach ? '#f59e0b22' : '#2d5fc422',
                        color: roleIsCoach ? '#f59e0b' : '#4d8ae8',
                        fontSize: 8,
                      }}>
                      {roleIsCoach ? 'COACH' : 'PLAYER'}
                    </span>
                  </div>
                  <p className="text-xs leading-tight" style={{
                    color: '#8892aa',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  } as React.CSSProperties}>
                    {post.caption}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── Section 3: Opportunities (last 5 roles posted) ──────────────────────────

function RecentOpportunities({ opps }: { opps: RecentOpportunity[] }) {
  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return `${Math.floor(days / 7)}w ago`
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-xl font-black uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Opportunities
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>Latest roles posted across the platform</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/dashboard/opportunities?new=1"
            className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-colors"
            style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#3a6fda')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#2d5fc4')}>
            + Add Opportunity
          </Link>
          <Link href="/dashboard/opportunities" className="text-xs font-semibold"
            style={{ color: '#2d5fc4', textDecoration: 'none' }}>
            View all →
          </Link>
        </div>
      </div>

      {opps.length === 0 ? (
        <div className="rounded-xl px-5 py-6 text-center"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>
            No opportunities posted yet. Be the first to post a role.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {opps.map(opp => {
            const showPos = opp.position && !opp.title.toLowerCase().includes(opp.position.toLowerCase())
            const meta = [showPos ? opp.position : null, opp.location].filter(Boolean).join(' · ')
            return (
              <Link key={opp.id} href="/dashboard/opportunities"
                className="relative flex items-center gap-3 rounded-xl px-4 py-3.5 overflow-hidden"
                style={{
                  backgroundColor: opp.isMine ? 'rgba(45,95,196,0.06)' : '#13172a',
                  border: `1px solid ${opp.isMine ? 'rgba(45,95,196,0.55)' : '#1e2235'}`,
                  textDecoration: 'none', display: 'flex',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = opp.isMine ? 'rgba(45,95,196,0.55)' : '#1e2235')}>
                {opp.isMine && (
                  <div className="absolute left-0 top-0 bottom-0" style={{ width: 3, backgroundColor: '#2d5fc4' }} />
                )}
                <LevelBadge level={opp.level} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <ClubCrest club={opp.club} />
                    <h3 className="font-bold uppercase truncate"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', fontSize: 17, lineHeight: 1.1 }}>
                      {opp.title}
                    </h3>
                    {opp.isMine && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: 'rgba(45,95,196,0.18)', color: '#4d8ae8' }}>
                        YOUR ROLE
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1 truncate" style={{ color: '#8892aa' }}>{meta || 'Details to follow'}</p>
                  {opp.isMine ? (
                    <p className="text-xs mt-0.5 font-semibold"
                      style={{ color: opp.applicationCount > 0 ? '#2d5fc4' : '#4b5563' }}>
                      {opp.applicationCount === 0
                        ? 'No applications yet'
                        : `👥 ${opp.applicationCount} application${opp.applicationCount === 1 ? '' : 's'}`}
                    </p>
                  ) : (
                    <p className="text-xs mt-0.5" style={{ color: '#5b6478' }}>{timeAgo(opp.created_at)}</p>
                  )}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── Section 4: Featured Players (Premium Carousel) ──────────────────────────

function PremiumCarousel({ players }: { players: PremiumPlayer[] }) {
  if (players.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="text-xl font-black uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Featured Players
        </h2>
        <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>Premium players appear first to clubs</p>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-4"
        style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
        {players.map(p => (
          <Link key={p.id} href={`/dashboard/player/players/${p.id}`}
            className="flex-shrink-0 rounded-2xl overflow-hidden block"
            style={{ width: 170, scrollSnapAlign: 'start', border: '1px solid #1e2235', textDecoration: 'none' }}>
            <div className="relative" style={{ height: 170, backgroundColor: '#1a1f3a' }}>
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="w-full h-full object-cover object-center" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(160deg, #13172a 0%, #0d1020 100%)' }}>
                  <span className="font-black text-5xl"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#1e2235' }}>
                    {getInitials(p.full_name)}
                  </span>
                </div>
              )}
              <div className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.4) 0%, transparent 60%)' }} />
              <div className="absolute top-2 right-2">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: 'rgba(45,95,196,0.85)', color: '#fff', fontSize: 10 }}>PRO</span>
              </div>
            </div>
            <div className="p-3 space-y-0.5" style={{ backgroundColor: '#13172a' }}>
              <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{p.full_name ?? 'Player'}</p>
              <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                {[p.position, p.city || p.location].filter(Boolean).join(' · ') || '—'}
              </p>
              {p.status && (
                <p className="text-xs font-semibold" style={{ color: STATUS_CONFIG[p.status]?.color, fontSize: 10 }}>
                  {STATUS_CONFIG[p.status]?.label}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─── Section 5: Your Shortlist ────────────────────────────────────────────────

function MyShortlist({ players }: { players: ShortlistPlayer[] }) {
  const weekAgo = Date.now() - 7 * 86400000
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-black uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Your Shortlist
          </h2>
          {players.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4' }}>
              {players.length}
            </span>
          )}
        </div>
        <Link href="/dashboard/coach/shortlists" className="text-xs font-semibold"
          style={{ color: '#2d5fc4', textDecoration: 'none' }}>
          View all →
        </Link>
      </div>

      {players.length === 0 ? (
        <div className="rounded-xl px-5 py-6 text-center"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
            You haven't shortlisted any players yet. Browse players to start building your shortlist.
          </p>
          <Link href="/dashboard/coach/players" className="mt-3 inline-block text-xs font-semibold"
            style={{ color: '#2d5fc4', textDecoration: 'none' }}>
            Browse Players →
          </Link>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-6 px-4"
          style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}>
          {players.map(p => {
            const statusCfg = p.status ? STATUS_CONFIG[p.status] : null
            const wasUpdated = p.updated_at ? new Date(p.updated_at).getTime() > weekAgo : false
            return (
              <Link key={p.savedId} href={`/dashboard/player/players/${p.player_id}`}
                className="flex-shrink-0 rounded-2xl overflow-hidden block"
                style={{ width: 150, scrollSnapAlign: 'start', border: '1px solid #1e2235', textDecoration: 'none' }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = '#2d5fc4')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = '#1e2235')}>
                <div className="relative" style={{ height: 150, backgroundColor: '#1a1f3a' }}>
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-full h-full object-cover object-center" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(160deg, #13172a 0%, #0d1020 100%)' }}>
                      <span className="font-black text-4xl"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#1e2235' }}>
                        {getInitials(p.full_name)}
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0"
                    style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.7) 0%, transparent 55%)' }} />
                  {wasUpdated && (
                    <div className="absolute top-2 right-2">
                      <span className="font-bold px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(245,158,11,0.9)', color: '#0a0a0a', fontSize: 9 }}>
                        UPDATED
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-0.5" style={{ backgroundColor: '#13172a' }}>
                  <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{p.full_name ?? 'Player'}</p>
                  <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                    {[p.position, p.city || p.location].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {statusCfg && (
                    <p className="text-xs font-semibold" style={{ color: statusCfg.color, fontSize: 10 }}>
                      {statusCfg.label}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ─── Recently Active ──────────────────────────────────────────────────────────

function ActiveUserCard({ user }: { user: ActiveUser }) {
  const isCoach = user.role === 'coach'
  const initials = getInitials(user.full_name)
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
            ? <img src={user.avatar_url} alt="" className="w-full h-full object-cover object-top" />
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
      if (interactingRef.current) {
        pos = el.scrollLeft
      } else {
        const half = el.scrollWidth / 2
        pos += 0.5
        if (half > 0 && pos >= half) pos -= half
        el.scrollLeft = pos
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
    <section className="space-y-2 -mx-6">
      <div className="flex items-center gap-1.5 px-6">
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
        <div ref={scrollRef} className="flex overflow-x-auto pl-6 pb-1" style={{ scrollbarWidth: 'none' }}>
          {loop.map((u, i) => <ActiveUserCard key={`${u.id}-${i}`} user={u} />)}
        </div>
      ) : (
        <div className="flex overflow-x-auto px-6 pb-1" style={{ scrollbarWidth: 'none' }}>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachDashboard() {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [coachProfile, setCoachProfile] = useState<{ full_name: string | null; avatar_url: string | null; coaching_role: string | null } | null>(null)
  const [coachCompletion, setCoachCompletion] = useState<CoachCompletionProfile | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([])
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([])
  const [recentOpportunities, setRecentOpportunities] = useState<RecentOpportunity[]>([])
  const [premiumPlayers, setPremiumPlayers] = useState<PremiumPlayer[]>([])
  const [myShortlist, setMyShortlist] = useState<ShortlistPlayer[]>([])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      // ── Phase 1: all independent queries in parallel ──────────────────────
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString()

      const [
        profileRes,
        recentOppsRes,
        savedRes,
        feedRes,
        premiumRes,
        activeRes,
      ] = await Promise.all([
        supabase.from('profiles')
          .select('full_name, premium, avatar_url, coaching_role, coaching_level, coaching_history, club, city, phone, bio, role')
          .eq('id', user.id).single(),

        // Last 5 roles posted across the platform (own + other clubs)
        supabase.from('opportunities')
          .select('id, coach_id, title, club, position, level, location, is_active, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(5),

        supabase.from('coach_saved_players')
          .select('id, player_id, folder_name, created_at')
          .eq('coach_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),

        supabase.from('posts')
          .select('id, post_type, caption, image_url, author:profiles!author_id(full_name, avatar_url, role)')
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(15),

        supabase.from('profiles')
          .select('id, full_name, position, avatar_url, status, location, city, premium')
          .in('role', ['player', 'admin'])
          .eq('approved', true)
          .eq('premium', true),

        // Recently active players + coaches
        supabase.from('profiles')
          .select('id, role, full_name, avatar_url, position, playing_level, coaching_role, coaching_level, club, city, status, last_active, created_at')
          .in('role', ['player', 'admin', 'coach'])
          .eq('approved', true)
          .not('last_active', 'is', null)
          .gte('last_active', twoWeeksAgo)
          .order('last_active', { ascending: false })
          .limit(20),
      ])

      // Profile
      const profile = profileRes.data
      setFullName(profile?.full_name ?? null)
      setCoachProfile({
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        coaching_role: profile?.coaching_role ?? null,
      })
      setCoachCompletion({
        avatar_url: profile?.avatar_url ?? null,
        full_name: profile?.full_name ?? null,
        club: profile?.club ?? null,
        city: profile?.city ?? null,
        phone: profile?.phone ?? null,
        bio: profile?.bio ?? null,
        coaching_role: profile?.coaching_role ?? null,
        coaching_level: profile?.coaching_level ?? null,
        coaching_history: profile?.coaching_history ?? null,
      })

      // Feed posts — normalize author join (Supabase returns as array)
      const rawPosts = (feedRes.data ?? []) as any[]
      setFeedPosts(rawPosts.map(p => ({
        id: p.id,
        post_type: p.post_type,
        caption: p.caption,
        image_url: p.image_url,
        author: Array.isArray(p.author) ? (p.author[0] ?? null) : (p.author ?? null),
      })))

      // Premium players — random order each session
      const shuffled = ((premiumRes.data ?? []) as PremiumPlayer[]).sort(() => Math.random() - 0.5).slice(0, 10)
      setPremiumPlayers(shuffled)

      // Recently active players + coaches (exclude self)
      setActiveUsers(((activeRes.data as ActiveUser[]) ?? []).filter(u => u.id !== user.id))

      // ── Phase 2: queries that depend on phase 1 results ───────────────────

      // Last 5 roles posted — flag the coach's own roles + count their applications
      const recentRows = (recentOppsRes.data ?? []) as Array<{ id: string; coach_id: string; title: string; club: string | null; position: string | null; level: string | null; location: string | null; is_active: boolean; created_at: string }>
      const myOppIds = recentRows.filter(o => o.coach_id === user.id).map(o => o.id)
      const countMap: Record<string, number> = {}
      if (myOppIds.length) {
        const { data: appData } = await supabase
          .from('applications')
          .select('opportunity_id')
          .in('opportunity_id', myOppIds)
        for (const a of appData ?? []) {
          countMap[a.opportunity_id] = (countMap[a.opportunity_id] ?? 0) + 1
        }
      }
      setRecentOpportunities(recentRows.map(o => ({
        id: o.id,
        title: o.title,
        club: o.club,
        position: o.position,
        level: o.level ?? null,
        location: o.location ?? null,
        is_active: o.is_active,
        created_at: o.created_at,
        isMine: o.coach_id === user.id,
        applicationCount: countMap[o.id] ?? 0,
      })))

      // Shortlist player profiles
      const savedRows = (savedRes.data ?? []) as Array<{ id: string; player_id: string; folder_name: string; created_at: string }>
      if (savedRows.length) {
        const playerIds = savedRows.map(r => r.player_id)
        const { data: playerData } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, position, city, location, status, updated_at')
          .in('id', playerIds)
        const playerMap = Object.fromEntries((playerData ?? []).map((p: any) => [p.id, p]))
        setMyShortlist(savedRows.map(r => {
          const p = playerMap[r.player_id] ?? {}
          return {
            savedId: r.id,
            player_id: r.player_id,
            full_name: p.full_name ?? null,
            avatar_url: p.avatar_url ?? null,
            position: p.position ?? null,
            city: p.city ?? null,
            location: p.location ?? null,
            status: p.status ?? null,
            updated_at: p.updated_at ?? null,
          }
        }))
      } else {
        setMyShortlist([])
      }

      setLoading(false)

      // Auto-sync Stripe premium state
      if (!profile?.premium) {
        fetch('/api/stripe/sync', { method: 'POST' }).catch(() => {})
      }
    }
    load()
  }, [router])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <CoachSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={coachProfile} />

      {/* Header */}
      <header className="px-4 pt-3 pb-2 flex items-center justify-between">
        <button onClick={() => setSidebarOpen(true)} className="flex flex-col gap-1.5" style={{ width: 22 }}>
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 22 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 16 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 22 }} />
        </button>
        <img src="/logo.jpg" alt="NEXT11VEN" className="h-9 w-auto" />
        <div style={{ width: 22 }} />
      </header>

      <main className="px-6 py-4 space-y-6"
        style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom) + 24px)' }}>

        {/* Welcome */}
        <div className="text-center">
          <p className="text-base" style={{ color: '#8892aa' }}>
            Welcome back,{' '}
            <span className="font-semibold" style={{ color: '#e8dece' }}>{fullName ? fullName.split(' ')[0] : 'Coach'}</span>
          </p>
        </div>

        {/* Recently Active — players + coaches */}
        {!loading && <RecentlyActiveSection users={activeUsers} />}

        {/* Showcase + Profile Completion — side by side */}
        {!loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
            <Link href="/dashboard/showcase" className="block h-full" style={{ textDecoration: 'none' }}>
              <div className="rounded-2xl p-4 flex flex-col gap-3 h-full"
                style={{ background: 'linear-gradient(135deg, #0d1a3a 0%, #13172a 100%)', border: '1px solid rgba(45,95,196,0.6)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black uppercase leading-tight mb-1"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                      Showcase Game 1 — Sold Out
                    </p>
                    <p className="text-xs" style={{ color: '#8892aa' }}>
                      28 players · Steps 3–7
                    </p>
                  </div>
                  <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: 'rgba(45,95,196,0.15)', border: '1px solid rgba(45,95,196,0.35)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                      <path d="M4 22h16" />
                      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
                    </svg>
                  </div>
                </div>
                <div className="mt-auto">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
                    style={{ backgroundColor: '#2d5fc4', color: '#e8dece' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#e8dece" stroke="none">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    View Full Game
                  </span>
                </div>
              </div>
            </Link>

            {coachCompletion && <CoachProfileCompletionBar profile={coachCompletion} />}
          </div>
        )}

        {/* Loading skeleton */}
        {loading ? (
          <div className="space-y-8">
            <div className="space-y-2">
              <div className="animate-pulse rounded-lg" style={{ height: 20, width: '40%', backgroundColor: '#1e2235' }} />
              <div className="flex gap-3">
                {[0, 1, 2].map(i => (
                  <div key={i} className="flex-shrink-0 animate-pulse rounded-2xl" style={{ width: 170, height: 200, backgroundColor: '#1e2235' }} />
                ))}
              </div>
            </div>
            {[0, 1, 2].map(i => (
              <div key={i} className="animate-pulse rounded-xl" style={{ height: 72, backgroundColor: '#1e2235' }} />
            ))}
          </div>
        ) : (
          <>
            <FeedPreview posts={feedPosts} />
            <PremiumCarousel players={premiumPlayers} />
            <RecentOpportunities opps={recentOpportunities} />
            <MyShortlist players={myShortlist} />
          </>
        )}
      </main>
    </div>
  )
}
