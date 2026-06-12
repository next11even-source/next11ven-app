'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

// ─── Types ────────────────────────────────────────────────────────────────────

type PricePoint = {
  price_id: string
  unit_amount_pence: number
  currency: string
  subscriber_count: number
  mrr_pence: number
}

type RevenueStats = {
  mrr_pence: number
  active_subs: number
  cancelling: number
  player_subs: number
  coach_subs: number
  player_mrr_pence: number
  coach_mrr_pence: number
  price_breakdown: PricePoint[]
  mrr_trend: { label: string; value: number }[]
  non_converting_count: number
  free_sub_count: number
}

type WaitlistPlayer = {
  id: string
  full_name: string | null
  position: string | null
  club: string | null
  showcase_waitlist_joined_at: string | null
}

type WaitlistCoach = {
  id: string
  full_name: string | null
  coaching_role: string | null
  club: string | null
  showcase_coach_waitlist_joined_at: string | null
}

type ShowcaseWaitlist = {
  players: WaitlistPlayer[]
  coaches: WaitlistCoach[]
  total: number
}

type MonthRow = {
  label: string
  new_signups: number
  new_premium: number
  churned: number
  messages: number
  applications: number
}

type PlatformStats = {
  mau: number
  mau_prev: number
  player_count: number
  coach_count: number
  open_opportunities: number
  pending_approvals: number
  monthly_table: MonthRow[]
  new_mrr_pence: number
  churned_mrr_pence: number
  legacy_count: number
  legacy_upgrade_pence: number
}

type DayPoint = { label: string; value: number }

type RecentLogin = {
  id: string
  email: string | null
  last_sign_in_at: string
  full_name: string | null
  role: string | null
  club: string | null
}

type MessageEntry = {
  id: string
  content: string
  created_at: string
  sender_name: string | null
  sender_club: string | null
  sender_role: string | null
  other_name: string | null
  other_club: string | null
  other_role: string | null
}

type RecentApplication = {
  id: string
  created_at: string
  status: string
  message: string | null
  player: { id: string; full_name: string | null; club: string | null; position: string | null } | null
  coach: { id: string; full_name: string | null; club: string | null } | null
  opportunity: { id: string; title: string | null; club: string | null; position: string | null; level: string | null } | null
}

type Stats = {
  totalUsers: number
  totalPlayers: number
  totalCoaches: number
  premiumCount: number
  premiumPlayers: number
  premiumCoaches: number
  cancellingCount: number
  mrrPence: number
  totalApproved: number
  claimed: number
  claimedPlayers: number
  claimedCoaches: number
  newSignups: number
  messagesSent: number
  newConversations: number
  profileViews: number
  applicationsSubmitted: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodStart(): Date {
  return new Date(Date.now() - 30 * 86400000)
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

function LineChart({ data, color = '#2d5fc4' }: { data: DayPoint[]; color?: string }) {
  if (!data.length) return null
  const W = 300
  const H = 100
  const padX = 8
  const padY = 12
  const chartW = W - padX * 2
  const chartH = H - padY * 2 - 14

  const max = Math.max(...data.map(d => d.value), 1)

  const pts = data.map((d, i) => ({
    x: data.length === 1 ? padX + chartW / 2 : padX + (i / (data.length - 1)) * chartW,
    y: padY + (1 - d.value / max) * chartH,
    ...d,
  }))

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaD = `${pathD} L${pts[pts.length - 1].x},${padY + chartH} L${pts[0].x},${padY + chartH}Z`

  const labelIdxs = data.length <= 3
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 2), data.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {[0, 0.5, 1].map(f => (
        <line key={f} x1={padX} y1={padY + f * chartH} x2={W - padX} y2={padY + f * chartH}
          stroke="#1e2235" strokeWidth="1" />
      ))}
      <path d={areaD} fill={color} opacity="0.1" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
      ))}
      {labelIdxs.map(i => (
        <text key={i} x={pts[i].x} y={H - 2} textAnchor="middle" fontSize="8" fill="#8892aa">
          {pts[i].label}
        </text>
      ))}
      <text x={padX} y={padY - 2} fontSize="8" fill="#8892aa">{max}</text>
    </svg>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = '#e8dece' }: {
  label: string; value: number | string; sub?: string; color?: string
}) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <span className="text-2xl font-black leading-none"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color }}>
        {value.toLocaleString()}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#e8dece', fontSize: 10 }}>{label}</span>
      {sub && <span className="text-xs" style={{ color: '#8892aa' }}>{sub}</span>}
    </div>
  )
}

// ─── Chart Card ───────────────────────────────────────────────────────────────

function ChartCard({ title, data, color, total, valuePrefix = '' }: {
  title: string; data: DayPoint[]; color: string; total: number; valuePrefix?: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{title}</p>
        <span className="text-sm font-black" style={{ color, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {valuePrefix}{total.toLocaleString()}
        </span>
      </div>
      {total === 0
        ? <div className="flex items-center justify-center h-24 rounded-lg" style={{ backgroundColor: '#0a0a0a' }}>
            <p className="text-xs" style={{ color: '#8892aa' }}>No data for this period</p>
          </div>
        : <LineChart data={data} color={color} />}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const router = useRouter()
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(true)
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [platformLoading, setPlatformLoading] = useState(true)
  const [msgLog, setMsgLog] = useState<MessageEntry[]>([])
  const [msgLoading, setMsgLoading] = useState(true)
  const [msgTotal, setMsgTotal] = useState(0)
  const [showAllMessages, setShowAllMessages] = useState(false)
  const [recentLogins, setRecentLogins] = useState<RecentLogin[]>([])
  const [loginsLoading, setLoginsLoading] = useState(true)
  const [recentApps, setRecentApps] = useState<RecentApplication[]>([])
  const [appsLoading, setAppsLoading] = useState(true)
  const [showAllApps, setShowAllApps] = useState(false)
  const [showAllLogins, setShowAllLogins] = useState(false)
  const [showcaseWaitlist, setShowcaseWaitlist] = useState<ShowcaseWaitlist | null>(null)
  const [showcaseLoading, setShowcaseLoading] = useState(true)
  const [showShowcaseList, setShowShowcaseList] = useState(false)

  useEffect(() => { load() }, [])

  useEffect(() => {
    fetch('/api/admin/revenue-stats')
      .then(r => r.json())
      .then(d => { setRevenueStats(d); setRevenueLoading(false) })
      .catch(() => setRevenueLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/admin/platform-stats')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setPlatformStats(d); setPlatformLoading(false) })
      .catch(() => setPlatformLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/admin/recent-logins')
      .then(r => r.json())
      .then(d => { setRecentLogins(d.logins ?? []); setLoginsLoading(false) })
      .catch(() => setLoginsLoading(false))
  }, [])

  useEffect(() => { loadMsgLog() }, [])

  useEffect(() => {
    fetch('/api/admin/recent-applications')
      .then(r => r.json())
      .then(d => { setRecentApps(d.applications ?? []); setAppsLoading(false) })
      .catch(() => setAppsLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/admin/showcase-waitlist')
      .then(r => r.json())
      .then(d => { setShowcaseWaitlist(d); setShowcaseLoading(false) })
      .catch(() => setShowcaseLoading(false))
  }, [])

  async function loadMsgLog() {
    setMsgLoading(true)
    const res = await fetch('/api/admin/messages?page=0')
    if (!res.ok) { setMsgLoading(false); return }
    const data = await res.json()
    setMsgLog(data.messages ?? [])
    setMsgTotal(data.total ?? 0)
    setMsgLoading(false)
  }

  async function load() {
    setLoading(true)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') { router.push('/dashboard/player'); return }

    const since = periodStart()
    const sinceIso = since.toISOString()

    const [
      { count: totalUsers },
      { count: totalPlayers },
      { count: totalCoaches },
      { count: premiumCount },
      { count: premiumPlayerCount },
      { count: premiumCoachCount },
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['player', 'admin']),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'coach'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('premium', true),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('premium', true).in('role', ['player', 'admin']),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('premium', true).eq('role', 'coach'),
    ])

    const { count: cancellingCount } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('cancel_at_period_end', true)

    const mrrPence = (premiumPlayerCount ?? 0) * 699 + (premiumCoachCount ?? 0) * 999

    const { data: approvedProfiles } = await supabase
      .from('profiles')
      .select('role, password_set_at, approved, approval_status')
      .or('role.neq.admin,role.is.null')

    const approvedAll = (approvedProfiles ?? []).filter(
      (p: { approved: boolean | null; approval_status: string | null }) =>
        p.approval_status === 'approved' || p.approved === true
    )
    const claimedAll = approvedAll.filter(
      (p: { password_set_at: string | null }) => p.password_set_at !== null
    )
    const claimedPlayersCount = claimedAll.filter(
      (p: { role: string | null }) => p.role === 'player' || p.role === 'admin'
    ).length
    const claimedCoachesCount = claimedAll.filter(
      (p: { role: string | null }) => p.role === 'coach'
    ).length

    const msgStatsUrl = `/api/admin/message-stats${sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : ''}`

    const [
      { count: newSignupsCount },
      { count: profileViewsCount },
      msgStatsRes,
    ] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso),
      supabase.from('player_views').select('id', { count: 'exact', head: true }).gte('viewed_at', sinceIso),
      fetch(msgStatsUrl).then(r => r.json()),
    ])

    setStats({
      totalUsers: totalUsers ?? 0,
      totalPlayers: totalPlayers ?? 0,
      totalCoaches: totalCoaches ?? 0,
      premiumCount: premiumCount ?? 0,
      premiumPlayers: premiumPlayerCount ?? 0,
      premiumCoaches: premiumCoachCount ?? 0,
      cancellingCount: cancellingCount ?? 0,
      mrrPence,
      totalApproved: approvedAll.length,
      claimed: claimedAll.length,
      claimedPlayers: claimedPlayersCount,
      claimedCoaches: claimedCoachesCount,
      newSignups: newSignupsCount ?? 0,
      messagesSent: msgStatsRes.messagesSent ?? 0,
      newConversations: msgStatsRes.newConversations ?? 0,
      profileViews: profileViewsCount ?? 0,
      applicationsSubmitted: msgStatsRes.applicationsSubmitted ?? 0,
    })
    setLoading(false)
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-3 pb-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.dispatchEvent(new Event('player:sidebar:open'))}
            className="p-2 rounded-lg"
            style={{ color: '#8892aa' }}
            aria-label="Open menu">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="17" y2="6" /><line x1="3" y1="10" x2="17" y2="10" /><line x1="3" y1="14" x2="17" y2="14" />
            </svg>
          </button>
          <h1 className="text-2xl font-black uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Analytics
          </h1>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
        </div>
      ) : stats ? (
        <div className="px-4 pt-4 space-y-4">

          {/* ── Key Metrics ───────────────────────────────────────────────────── */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Key Metrics</p>
            <InsightCard
              label="Monthly Active Users"
              value={platformLoading ? '…' : (platformStats?.mau ?? 0)}
              color="#2d5fc4"
              trend={platformStats && platformStats.mau_prev > 0
                ? { delta: platformStats.mau - platformStats.mau_prev, label: 'vs prev 30d' }
                : null}
            />
          </section>

          {/* ── Showcase Game 2 Waitlist ──────────────────────────────────────── */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Showcase Game 2 — Waitlist</p>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
              {showcaseLoading ? (
                <div className="flex items-center justify-center py-6" style={{ backgroundColor: '#13172a' }}>
                  <div className="w-5 h-5 rounded-full border-2 animate-spin"
                    style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
                </div>
              ) : showcaseWaitlist ? (
                <>
                  <button
                    onClick={() => setShowShowcaseList(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 transition-opacity hover:opacity-80"
                    style={{ backgroundColor: '#13172a' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-black leading-none"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                        {showcaseWaitlist.total}
                      </span>
                      <div className="text-left">
                        <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>
                          {showcaseWaitlist.total === 1 ? 'person registered interest' : 'people registered interest'}
                        </p>
                        <p className="text-xs" style={{ color: '#8892aa' }}>
                          {showcaseWaitlist.players.length} {showcaseWaitlist.players.length === 1 ? 'player' : 'players'} · {showcaseWaitlist.coaches.length} {showcaseWaitlist.coaches.length === 1 ? 'coach' : 'coaches'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold" style={{ color: '#8892aa' }}>
                      {showShowcaseList ? 'Hide ↑' : 'View all ↓'}
                    </span>
                  </button>

                  {showShowcaseList && showcaseWaitlist.total > 0 && (
                    <div className="divide-y" style={{ borderColor: '#1e2235', borderTop: '1px solid #1e2235' }}>
                      {showcaseWaitlist.players.map((p, i) => (
                        <div key={p.id} className="flex items-center justify-between px-4 py-3"
                          style={{ backgroundColor: i % 2 === 0 ? '#0d1020' : '#13172a' }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <RoleBadge role="player" />
                              <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                                {p.full_name ?? '—'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {p.position && <span className="text-xs" style={{ color: '#2d5fc4' }}>{p.position}</span>}
                              {p.club && <span className="text-xs" style={{ color: '#8892aa' }}>· {p.club}</span>}
                            </div>
                          </div>
                          {p.showcase_waitlist_joined_at && (
                            <p className="text-xs tabular-nums flex-shrink-0 ml-3" style={{ color: '#8892aa' }}>
                              {new Date(p.showcase_waitlist_joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </p>
                          )}
                        </div>
                      ))}
                      {showcaseWaitlist.coaches.map((c, i) => (
                        <div key={c.id} className="flex items-center justify-between px-4 py-3"
                          style={{ backgroundColor: (showcaseWaitlist.players.length + i) % 2 === 0 ? '#0d1020' : '#13172a' }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <RoleBadge role="coach" />
                              <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                                {c.full_name ?? '—'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {c.coaching_role && <span className="text-xs" style={{ color: '#a78bfa' }}>{c.coaching_role}</span>}
                              {c.club && <span className="text-xs" style={{ color: '#8892aa' }}>· {c.club}</span>}
                            </div>
                          </div>
                          {c.showcase_coach_waitlist_joined_at && (
                            <p className="text-xs tabular-nums flex-shrink-0 ml-3" style={{ color: '#8892aa' }}>
                              {new Date(c.showcase_coach_waitlist_joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {showShowcaseList && showcaseWaitlist.total === 0 && (
                    <div className="px-4 py-4 text-center" style={{ backgroundColor: '#0d1020', borderTop: '1px solid #1e2235' }}>
                      <p className="text-xs" style={{ color: '#8892aa' }}>No one on the waitlist yet.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="px-4 py-6 text-center" style={{ backgroundColor: '#13172a' }}>
                  <p className="text-xs" style={{ color: '#8892aa' }}>Could not load waitlist data.</p>
                </div>
              )}
            </div>
          </section>

          {/* ── Platform Totals ───────────────────────────────────────────────── */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Platform Totals</p>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Total Users" value={stats.totalUsers} />
              <StatCard label="Premium Subscribers" value={stats.premiumCount} color="#f59e0b" />
              <StatCard label="Players" value={stats.totalPlayers} />
              <StatCard label="Coaches" value={stats.totalCoaches} />
            </div>
          </section>

          {/* ── Recently Online ───────────────────────────────────────────────── */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Recently Online</p>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
              {loginsLoading ? (
                <div className="flex items-center justify-center py-8" style={{ backgroundColor: '#13172a' }}>
                  <div className="w-5 h-5 rounded-full border-2 animate-spin"
                    style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
                </div>
              ) : recentLogins.length === 0 ? (
                <div className="py-8 text-center" style={{ backgroundColor: '#13172a' }}>
                  <p className="text-sm" style={{ color: '#8892aa' }}>No sign-in data yet.</p>
                </div>
              ) : (
                <>
                  <div className="divide-y" style={{ borderColor: '#1e2235' }}>
                    {(showAllLogins ? recentLogins.slice(0, 15) : recentLogins.slice(0, 5)).map((u, i) => (
                      <div key={u.id} className="flex items-center gap-3 px-4 py-3"
                        style={{ backgroundColor: i === 0 ? '#0d1020' : '#13172a' }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                              {u.full_name ?? u.email ?? '—'}
                            </span>
                            <RoleBadge role={u.role} />
                          </div>
                          {u.club && (
                            <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>{u.club}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs tabular-nums" style={{ color: '#8892aa' }}>
                            {new Date(u.last_sign_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </p>
                          <p className="text-xs tabular-nums" style={{ color: '#3a4055' }}>
                            {new Date(u.last_sign_in_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {recentLogins.length > 5 && (
                    <button
                      onClick={() => setShowAllLogins(v => !v)}
                      className="w-full px-4 py-2.5 text-xs font-semibold text-center transition-colors"
                      style={{ backgroundColor: '#0d1020', borderTop: '1px solid #1e2235', color: '#8892aa' }}>
                      {showAllLogins ? 'Show less' : `See ${Math.min(recentLogins.length, 15) - 5} more`}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>

          {/* ── Revenue ───────────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Revenue</p>
              <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
                Live from Stripe
              </span>
            </div>

            {revenueLoading ? (
              <div className="rounded-xl p-6 flex items-center justify-center"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <div className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
              </div>
            ) : revenueStats ? (
              <div className="space-y-3">
                <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#8892aa' }}>MRR</p>
                      <p className="text-4xl font-black leading-none"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#f59e0b' }}>
                        £{(revenueStats.mrr_pence / 100).toFixed(2)}
                      </p>
                      <p className="text-xs mt-1" style={{ color: '#8892aa' }}>
                        £{(revenueStats.mrr_pence / 100 * 12).toFixed(0)} annualised
                      </p>
                      {revenueStats.free_sub_count > 0 && (
                        <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                          <span style={{ color: '#3a4055' }}>
                            {revenueStats.free_sub_count} complimentary {revenueStats.free_sub_count === 1 ? 'plan' : 'plans'} excluded
                          </span>
                        </p>
                      )}
                      {platformStats && (platformStats.new_mrr_pence > 0 || platformStats.churned_mrr_pence > 0) && (
                        <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                          {platformStats.new_mrr_pence > 0 && (
                            <span style={{ color: '#2d5fc4' }}>+£{(platformStats.new_mrr_pence / 100).toFixed(2)} </span>
                          )}
                          {platformStats.churned_mrr_pence > 0 && (
                            <span style={{ color: '#ef4444' }}>−£{(platformStats.churned_mrr_pence / 100).toFixed(2)} </span>
                          )}
                          <span>this month</span>
                        </p>
                      )}
                    </div>
                    {revenueStats.cancelling > 0 && (
                      <div className="text-right">
                        <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#8892aa' }}>Cancelling</p>
                        <p className="text-2xl font-black leading-none"
                          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ef4444' }}>
                          {revenueStats.cancelling}
                        </p>
                        <p className="text-xs mt-1" style={{ color: '#8892aa' }}>at period end</p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892aa' }}>Player Premium</p>
                      <p className="text-xl font-black leading-none"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                        {revenueStats.player_subs}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                        £{(revenueStats.player_mrr_pence / 100).toFixed(2)}/mo
                      </p>
                    </div>
                    <div className="rounded-lg p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892aa' }}>Coach Pro</p>
                      <p className="text-xl font-black leading-none"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#a78bfa' }}>
                        {revenueStats.coach_subs}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                        £{(revenueStats.coach_mrr_pence / 100).toFixed(2)}/mo
                      </p>
                    </div>
                  </div>

                  {revenueStats.price_breakdown.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: '#8892aa' }}>Pricing Tiers</p>
                      <div className="space-y-1.5">
                        {revenueStats.price_breakdown.map((tier) => {
                          const amount = tier.unit_amount_pence / 100
                          const isLegacy = tier.unit_amount_pence < 699
                          const label = isLegacy
                            ? `Legacy (£${amount.toFixed(2)})`
                            : tier.unit_amount_pence >= 999
                              ? `Coach Pro (£${amount.toFixed(2)})`
                              : `Player Premium (£${amount.toFixed(2)})`
                          const color = isLegacy ? '#8892aa' : tier.unit_amount_pence >= 999 ? '#a78bfa' : '#2d5fc4'
                          return (
                            <div key={tier.price_id} className="flex items-center justify-between rounded-lg px-3 py-2"
                              style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold" style={{ color }}>{label}</span>
                                {isLegacy && (
                                  <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                                    style={{ backgroundColor: 'rgba(136,146,170,0.12)', color: '#8892aa' }}>
                                    Legacy
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-black tabular-nums"
                                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color }}>
                                  {tier.subscriber_count}
                                </span>
                                <span className="text-xs ml-1.5" style={{ color: '#8892aa' }}>
                                  · £{(tier.mrr_pence / 100).toFixed(2)}/mo
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {platformStats && platformStats.legacy_count > 0 && (
                    <div className="flex items-center justify-between rounded-lg px-3 py-2.5"
                      style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
                          Legacy upgrade opportunity
                        </p>
                        <p className="text-xs" style={{ color: '#8892aa' }}>
                          {platformStats.legacy_count} users on old pricing
                        </p>
                      </div>
                      <p className="text-sm font-black"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#f59e0b' }}>
                        +£{(platformStats.legacy_upgrade_pence / 100).toFixed(2)}/mo
                      </p>
                    </div>
                  )}

                  {stats && stats.totalApproved > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs" style={{ color: '#8892aa' }}>
                          Premium conversion
                          {revenueStats.non_converting_count > 0 && (
                            <span style={{ color: '#3a4055' }}>
                              {' '}· {revenueStats.non_converting_count} approved users not yet subscribed
                            </span>
                          )}
                        </p>
                        <p className="text-xs font-bold" style={{ color: '#f59e0b' }}>
                          {Math.round((revenueStats.active_subs / stats.totalApproved) * 100)}%
                        </p>
                      </div>
                      <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#1e2235' }}>
                        <div className="h-1.5 rounded-full"
                          style={{
                            width: `${Math.round((revenueStats.active_subs / stats.totalApproved) * 100)}%`,
                            backgroundColor: '#f59e0b',
                          }} />
                      </div>
                    </div>
                  )}
                </div>

                {revenueStats.mrr_trend.length > 0 && (
                  <ChartCard
                    title="MRR Trend (6 months)"
                    data={revenueStats.mrr_trend.map(d => ({ ...d, value: Math.round(d.value / 100) }))}
                    color="#f59e0b"
                    total={Math.round(revenueStats.mrr_pence / 100)}
                    valuePrefix="£"
                  />
                )}
              </div>
            ) : (
              <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <p className="text-sm" style={{ color: '#8892aa' }}>Could not load Stripe data.</p>
              </div>
            )}
          </section>

          {/* ── Month by Month ────────────────────────────────────────────────── */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Month by Month</p>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
              {platformLoading ? (
                <div className="flex items-center justify-center py-8" style={{ backgroundColor: '#13172a' }}>
                  <div className="w-5 h-5 rounded-full border-2 animate-spin"
                    style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
                </div>
              ) : platformStats && platformStats.monthly_table.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ backgroundColor: '#0a0a0a', borderBottom: '1px solid #1e2235' }}>
                        <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider"
                          style={{ color: '#8892aa' }}>Month</th>
                        <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                          style={{ color: '#2d5fc4' }}>Signups</th>
                        <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                          style={{ color: '#f59e0b' }}>New Sub</th>
                        <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                          style={{ color: '#ef4444' }}>Churned</th>
                        <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                          style={{ color: '#a78bfa' }}>Msgs</th>
                        <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                          style={{ color: '#60a5fa' }}>Apps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {platformStats.monthly_table.map((row, i) => {
                        const isCurrentMonth = i === platformStats.monthly_table.length - 1
                        return (
                          <tr key={row.label}
                            style={{
                              backgroundColor: isCurrentMonth ? '#0d1020' : '#13172a',
                              borderBottom: i < platformStats.monthly_table.length - 1 ? '1px solid #1e2235' : 'none',
                            }}>
                            <td className="px-3 py-2.5 font-semibold"
                              style={{ color: isCurrentMonth ? '#e8dece' : '#8892aa' }}>
                              {row.label}
                              {isCurrentMonth && (
                                <span className="ml-1.5 text-xs" style={{ color: '#3a4055' }}>·now</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold"
                              style={{ color: row.new_signups > 0 ? '#2d5fc4' : '#3a4055' }}>
                              {row.new_signups || '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold"
                              style={{ color: row.new_premium > 0 ? '#f59e0b' : '#3a4055' }}>
                              {row.new_premium > 0 ? `+${row.new_premium}` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold"
                              style={{ color: row.churned > 0 ? '#ef4444' : '#3a4055' }}>
                              {row.churned > 0 ? `-${row.churned}` : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums"
                              style={{ color: row.messages > 0 ? '#a78bfa' : '#3a4055' }}>
                              {row.messages || '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums"
                              style={{ color: row.applications > 0 ? '#60a5fa' : '#3a4055' }}>
                              {row.applications || '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-4 py-6 text-center" style={{ backgroundColor: '#13172a' }}>
                  <p className="text-xs" style={{ color: '#8892aa' }}>No monthly data yet.</p>
                </div>
              )}
            </div>
          </section>

          {/* ── Migration Tracker ─────────────────────────────────────────────── */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Migration Tracker</p>
            <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Users signed in to new app</p>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4' }}>
                  {stats.claimed} / {stats.totalApproved}
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs" style={{ color: '#8892aa' }}>Migration progress</p>
                  <p className="text-xs font-bold" style={{
                    color: stats.totalApproved > 0 && stats.claimed / stats.totalApproved >= 0.75 ? '#60a5fa'
                      : stats.totalApproved > 0 && stats.claimed / stats.totalApproved >= 0.4 ? '#f59e0b'
                      : '#8892aa'
                  }}>
                    {stats.totalApproved > 0 ? Math.round((stats.claimed / stats.totalApproved) * 100) : 0}%
                  </p>
                </div>
                <div className="w-full rounded-full h-2" style={{ backgroundColor: '#1e2235' }}>
                  <div className="h-2 rounded-full transition-all" style={{
                    width: `${stats.totalApproved > 0 ? Math.round((stats.claimed / stats.totalApproved) * 100) : 0}%`,
                    backgroundColor: stats.totalApproved > 0 && stats.claimed / stats.totalApproved >= 0.75 ? '#60a5fa'
                      : stats.totalApproved > 0 && stats.claimed / stats.totalApproved >= 0.4 ? '#f59e0b'
                      : '#2d5fc4'
                  }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Players', value: stats.claimedPlayers, color: '#2d5fc4' },
                  { label: 'Coaches', value: stats.claimedCoaches, color: '#a78bfa' },
                  { label: 'Total', value: stats.claimed, color: '#e8dece' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg px-2 py-2 text-center"
                    style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                    <p className="text-lg font-black leading-none"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", color: s.color }}>
                      {s.value}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Last 30 Days ──────────────────────────────────────────────────── */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Last 30 Days</p>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="New Signups" value={stats.newSignups} color="#2d5fc4" />
              <StatCard label="Messages Sent" value={stats.messagesSent} color="#a78bfa" />
              <StatCard label="New Conversations" value={stats.newConversations} color="#a78bfa" />
              <StatCard label="Profile Views" value={stats.profileViews} color="#60a5fa" />
              <StatCard label="Applications" value={stats.applicationsSubmitted} color="#f59e0b" />
            </div>
          </section>

          {/* ── Message Log ───────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Message Log</p>
              {msgTotal > 0 && (
                <span className="text-xs" style={{ color: '#8892aa' }}>{msgTotal.toLocaleString()} total</span>
              )}
            </div>

            {msgLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
              </div>
            ) : msgLog.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <p className="text-sm" style={{ color: '#8892aa' }}>No messages yet.</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
                <div className="divide-y" style={{ borderColor: '#1e2235' }}>
                  {(showAllMessages ? msgLog : msgLog.slice(0, 5)).map((m, i) => (
                    <div key={m.id} className="px-4 py-3"
                      style={{ backgroundColor: i === 0 ? '#0d1020' : '#13172a' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <RoleBadge role={m.sender_role} />
                            <span className="text-xs font-bold truncate" style={{ color: '#e8dece' }}>
                              {m.sender_name ?? '—'}
                            </span>
                            {m.sender_club && (
                              <span className="text-xs truncate" style={{ color: '#8892aa' }}>· {m.sender_club}</span>
                            )}
                            <span className="text-xs" style={{ color: '#3a4055' }}>→</span>
                            <span className="text-xs font-semibold truncate" style={{ color: '#8892aa' }}>
                              {m.other_name ?? '—'}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>
                            {m.content.length > 100 ? m.content.slice(0, 100) + '…' : m.content}
                          </p>
                        </div>
                        <p className="text-xs flex-shrink-0 tabular-nums" style={{ color: '#3a4055' }}>
                          {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {msgLog.length > 5 && (
                  <button
                    onClick={() => setShowAllMessages(v => !v)}
                    className="w-full px-4 py-2.5 text-xs font-semibold text-center transition-colors"
                    style={{ backgroundColor: '#0d1020', borderTop: '1px solid #1e2235', color: '#8892aa' }}>
                    {showAllMessages ? 'Show less' : `See ${msgLog.length - 5} more recent`}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ── Recent Applications ───────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Recent Applications</p>
              {recentApps.length > 0 && (
                <span className="text-xs" style={{ color: '#8892aa' }}>{recentApps.length} total</span>
              )}
            </div>

            {appsLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-6 h-6 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#f59e0b', borderTopColor: 'transparent' }} />
              </div>
            ) : recentApps.length === 0 ? (
              <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <p className="text-sm" style={{ color: '#8892aa' }}>No applications yet.</p>
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
                <div className="divide-y" style={{ borderColor: '#1e2235' }}>
                  {(showAllApps ? recentApps : recentApps.slice(0, 5)).map((a, i) => (
                    <div key={a.id} className="px-4 py-3"
                      style={{ backgroundColor: i === 0 ? '#0d1020' : '#13172a' }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <RoleBadge role="player" />
                            <span className="text-xs font-bold truncate" style={{ color: '#e8dece' }}>
                              {a.player?.full_name ?? '—'}
                            </span>
                            {a.player?.club && (
                              <span className="text-xs truncate" style={{ color: '#8892aa' }}>· {a.player.club}</span>
                            )}
                          </div>
                          <p className="text-xs" style={{ color: '#8892aa' }}>
                            Applied to{' '}
                            <span style={{ color: '#e8dece' }}>{a.opportunity?.title ?? '—'}</span>
                            {a.opportunity?.club && <span> · {a.opportunity.club}</span>}
                          </p>
                          {a.coach?.full_name && (
                            <p className="text-xs" style={{ color: '#3a4055' }}>
                              Coach: {a.coach.full_name}{a.coach.club ? ` · ${a.coach.club}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 space-y-1">
                          <p className="text-xs tabular-nums" style={{ color: '#8892aa' }}>
                            {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </p>
                          <span className="text-xs px-1.5 py-0.5 rounded font-bold inline-block" style={{
                            backgroundColor: a.status === 'accepted' ? 'rgba(45,95,196,0.15)'
                              : a.status === 'rejected' ? 'rgba(239,68,68,0.12)'
                              : a.status === 'shortlisted' ? 'rgba(167,139,250,0.15)'
                              : 'rgba(136,146,170,0.12)',
                            color: a.status === 'accepted' ? '#2d5fc4'
                              : a.status === 'rejected' ? '#ef4444'
                              : a.status === 'shortlisted' ? '#a78bfa'
                              : '#8892aa',
                          }}>
                            {a.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {recentApps.length > 5 && (
                  <button
                    onClick={() => setShowAllApps(v => !v)}
                    className="w-full px-4 py-2.5 text-xs font-semibold text-center transition-colors"
                    style={{ backgroundColor: '#0d1020', borderTop: '1px solid #1e2235', color: '#8892aa' }}>
                    {showAllApps ? 'Show less' : `See ${recentApps.length - 5} more`}
                  </button>
                )}
              </div>
            )}
          </section>


        </div>
      ) : null}
    </div>
  )
}

function InsightCard({ label, value, sub, trend, color = '#e8dece' }: {
  label: string
  value: string | number
  sub?: string
  trend?: { delta: number; label: string } | null
  color?: string
}) {
  const up = trend && trend.delta > 0
  const trendColor = up ? '#2d5fc4' : '#ef4444'
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <span className="text-xs font-semibold uppercase tracking-wider leading-tight"
        style={{ color: '#8892aa', fontSize: 10 }}>{label}</span>
      <span className="text-3xl font-black leading-none"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color }}>
        {value}
      </span>
      <div className="flex items-center gap-1.5 flex-wrap min-h-[14px]">
        {trend != null && trend.delta !== 0 && (
          <span className="text-xs font-bold" style={{ color: trendColor }}>
            {up ? '▲' : '▼'} {Math.abs(trend.delta)} {trend.label}
          </span>
        )}
        {sub && <span className="text-xs" style={{ color: '#8892aa' }}>{sub}</span>}
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null
  const isCoach = role === 'coach'
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0"
      style={{
        backgroundColor: isCoach ? 'rgba(168,139,250,0.15)' : 'rgba(45,95,196,0.15)',
        color: isCoach ? '#a78bfa' : '#2d5fc4',
      }}>
      {isCoach ? 'Coach' : 'Player'}
    </span>
  )
}
