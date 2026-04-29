'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import CoachSidebar from './_components/CoachSidebar'

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

type MyOpportunity = {
  id: string
  title: string
  club: string | null
  position: string | null
  is_active: boolean
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
      href: '/dashboard/coach/opportunities',
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
    <div className="grid grid-cols-3 gap-2">
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

// ─── Section 3: Your Opportunities ───────────────────────────────────────────

function MyOpportunities({ opps }: { opps: MyOpportunity[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-black uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Your Opportunities 🔥
        </h2>
        <Link href="/dashboard/coach/opportunities" className="text-xs font-semibold"
          style={{ color: '#2d5fc4', textDecoration: 'none' }}>
          Manage →
        </Link>
      </div>

      {opps.length === 0 ? (
        <div className="rounded-xl px-5 py-8 flex flex-col items-center text-center gap-4"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
            You're not currently recruiting. Post a role to start receiving applications.
          </p>
          <Link href="/dashboard/coach/opportunities"
            className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider"
            style={{ backgroundColor: '#e8dece', color: '#0a0a0a', textDecoration: 'none' }}>
            Post a Role
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {opps.map(opp => (
            <Link key={opp.id} href="/dashboard/coach/opportunities"
              className="flex items-center gap-3 rounded-xl px-4 py-3.5"
              style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none', display: 'flex' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#1e2235')}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                    {opp.club ?? 'Your Club'}
                  </p>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: opp.is_active ? 'rgba(245,158,11,0.12)' : 'rgba(136,146,170,0.1)',
                      color: opp.is_active ? '#f59e0b' : '#8892aa',
                    }}>
                    {opp.is_active ? 'OPEN' : 'CLOSED'}
                  </span>
                </div>
                <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{opp.title}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {opp.position && (
                    <p className="text-xs" style={{ color: '#8892aa' }}>{opp.position}</p>
                  )}
                  {opp.position && <span style={{ color: '#374151' }}>·</span>}
                  <p className="text-xs" style={{ color: '#4b5563' }}>
                    {opp.applicationCount === 0
                      ? 'No applications yet'
                      : `${opp.applicationCount} application${opp.applicationCount === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          ))}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachDashboard() {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [coachProfile, setCoachProfile] = useState<{ full_name: string | null; avatar_url: string | null; coaching_role: string | null } | null>(null)
  const [fullName, setFullName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [statsNewApps, setStatsNewApps] = useState(0)
  const [statsLookingForClub, setStatsLookingForClub] = useState(0)
  const [statsUnread, setStatsUnread] = useState(0)
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([])
  const [myOpportunities, setMyOpportunities] = useState<MyOpportunity[]>([])
  const [premiumPlayers, setPremiumPlayers] = useState<PremiumPlayer[]>([])
  const [myShortlist, setMyShortlist] = useState<ShortlistPlayer[]>([])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }

      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

      // ── Phase 1: all independent queries in parallel ──────────────────────
      const [
        profileRes,
        appsRes,
        lookingRes,
        myOppsRes,
        savedRes,
        feedRes,
        premiumRes,
        convsRes,
      ] = await Promise.all([
        supabase.from('profiles')
          .select('full_name, premium, avatar_url, coaching_role, role')
          .eq('id', user.id).single(),

        supabase.from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', user.id)
          .gte('created_at', weekAgo),

        supabase.from('profiles')
          .select('id', { count: 'exact', head: true })
          .in('role', ['player', 'admin'])
          .eq('approved', true)
          .in('status', ['free_agent', 'loan_dual_reg', 'just_exploring']),

        supabase.from('opportunities')
          .select('id, title, club, position, is_active')
          .eq('coach_id', user.id)
          .order('is_active', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(10),

        supabase.from('coach_saved_players')
          .select('id, player_id, folder_name, created_at')
          .eq('coach_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),

        supabase.from('posts')
          .select('id, post_type, caption, image_url, author:profiles!author_id(full_name, avatar_url, role)')
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(3),

        supabase.from('profiles')
          .select('id, full_name, position, avatar_url, status, location, city, premium')
          .in('role', ['player', 'admin'])
          .eq('approved', true)
          .eq('premium', true)
          .limit(20),

        supabase.from('conversations')
          .select('id')
          .eq('coach_id', user.id),
      ])

      // Profile
      const profile = profileRes.data
      setFullName(profile?.full_name ?? null)
      setCoachProfile({
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
        coaching_role: profile?.coaching_role ?? null,
      })

      // Stats
      setStatsNewApps(appsRes.count ?? 0)
      setStatsLookingForClub(lookingRes.count ?? 0)

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
      const shuffled = ((premiumRes.data ?? []) as PremiumPlayer[]).sort(() => Math.random() - 0.5)
      setPremiumPlayers(shuffled)

      // ── Phase 2: queries that depend on phase 1 results ───────────────────

      // Unread messages
      const convIds = (convsRes.data ?? []).map((c: { id: string }) => c.id)
      if (convIds.length) {
        const { count } = await supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .neq('sender_id', user.id)
          .is('read_at', null)
        setStatsUnread(count ?? 0)
      }

      // Application counts per opportunity
      const myOppsData = (myOppsRes.data ?? []) as Array<{ id: string; title: string; club: string | null; position: string | null; is_active: boolean }>
      if (myOppsData.length) {
        const oppIds = myOppsData.map(o => o.id)
        const { data: appData } = await supabase
          .from('applications')
          .select('opportunity_id')
          .in('opportunity_id', oppIds)
        const countMap: Record<string, number> = {}
        for (const a of appData ?? []) {
          countMap[a.opportunity_id] = (countMap[a.opportunity_id] ?? 0) + 1
        }
        setMyOpportunities(myOppsData.map(o => ({
          id: o.id,
          title: o.title,
          club: o.club,
          position: o.position,
          is_active: o.is_active,
          applicationCount: countMap[o.id] ?? 0,
        })))
      } else {
        setMyOpportunities([])
      }

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
      <header className="px-4 pt-6 pb-4 flex items-center justify-between">
        <button onClick={() => setSidebarOpen(true)} className="flex flex-col gap-1.5" style={{ width: 22 }}>
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 22 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 16 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 22 }} />
        </button>
        <img src="/logo.jpg" alt="NEXT11VEN" className="h-9 w-auto" />
        <div style={{ width: 22 }} />
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-10"
        style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom) + 24px)' }}>

        {/* Welcome */}
        <div>
          <h1 className="text-3xl font-extrabold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Welcome{fullName ? `, ${fullName.split(' ')[0]}` : ' Back'}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#8892aa' }}>
            Scout and connect with non-league players.
          </p>
        </div>

        {/* Showcase Day Banner */}
        <div className="rounded-2xl p-4 flex flex-col gap-3"
          style={{ background: 'linear-gradient(135deg, #0d1a3a 0%, #13172a 100%)', border: '1px solid #2d5fc4' }}>
          <p className="text-sm leading-relaxed" style={{ color: '#e8dece' }}>
            🏆 <strong>End of Season Showcase Day</strong><br />
            Register to attend and scout players at your level.<br />
            <span style={{ color: '#60a5fa' }}>Step 3–7 players registered.</span>
          </p>
          <a href="https://forms.gle/T5w5jneVc2rFUa4y6"
            target="_blank" rel="noopener noreferrer"
            className="rounded-xl py-2 text-xs font-bold uppercase tracking-wider text-center block"
            style={{ backgroundColor: '#e8dece', color: '#0a0a0a' }}>
            Register Interest
          </a>
        </div>

        {/* Loading skeleton */}
        {loading ? (
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="animate-pulse rounded-2xl" style={{ height: 80, backgroundColor: '#1e2235' }} />
              ))}
            </div>
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
            {/* Section 1 */}
            <CoachQuickStats
              newApps={statsNewApps}
              lookingForClub={statsLookingForClub}
              unread={statsUnread}
            />

            {/* Section 2 */}
            <FeedPreview posts={feedPosts} />

            {/* Section 3 */}
            <MyOpportunities opps={myOpportunities} />

            {/* Section 4 */}
            <PremiumCarousel players={premiumPlayers} />

            {/* Section 5 */}
            <MyShortlist players={myShortlist} />
          </>
        )}
      </main>
    </div>
  )
}
