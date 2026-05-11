'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
  churn_risk: {
    id: string
    full_name: string | null
    role: string | null
    club: string | null
    last_seen: string | null
    period_end: string | null
  }[]
  non_converting_count: number
}

type MonthRow = {
  label: string
  new_signups: number
  new_premium: number
  churned: number
  messages: number
}

type PlatformStats = {
  mau: number
  mau_prev: number
  player_count: number
  coach_count: number
  reply_rate_pct: number | null
  reply_total_convos: number
  open_opportunities: number
  funnel: { registered: number; approved: number; active_30d: number; premium: number }
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

type Stats = {
  totalUsers: number
  totalPlayers: number
  totalCoaches: number
  premiumCount: number
  premiumPlayers: number
  premiumCoaches: number
  cancellingCount: number
  mrrPence: number
  // Migration
  totalApproved: number
  claimed: number
  claimedPlayers: number
  claimedCoaches: number
  // In-period counts
  newSignups: number
  messagesSent: number
  newConversations: number
  profileViews: number
  applicationsSubmitted: number
  postsSent: number
  // Time series
  signupSeries: DayPoint[]
  messageSeries: DayPoint[]
  viewSeries: DayPoint[]
  postSeries: DayPoint[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodStart(): Date {
  return new Date(Date.now() - 30 * 86400000)
}

function bucketDays(rows: string[], days: number): DayPoint[] {
  const now = Date.now()
  const buckets: Record<string, number> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000)
    buckets[dayKey(d)] = 0
  }
  for (const ts of rows) {
    const d = new Date(ts)
    const k = dayKey(d)
    if (k in buckets) buckets[k] = (buckets[k] ?? 0) + 1
  }
  return Object.entries(buckets).map(([label, value]) => ({ label, value }))
}

function dayKey(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function buildSeries(timestamps: string[]): DayPoint[] {
  return bucketDays(timestamps, 30)
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

function LineChart({ data, color = '#2d5fc4' }: { data: DayPoint[]; color?: string }) {
  if (!data.length) return null
  const W = 300
  const H = 100
  const padX = 8
  const padY = 12
  const chartW = W - padX * 2
  const chartH = H - padY * 2 - 14 // room for x labels

  const max = Math.max(...data.map(d => d.value), 1)

  const pts = data.map((d, i) => ({
    x: data.length === 1 ? padX + chartW / 2 : padX + (i / (data.length - 1)) * chartW,
    y: padY + (1 - d.value / max) * chartH,
    ...d,
  }))

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaD = `${pathD} L${pts[pts.length - 1].x},${padY + chartH} L${pts[0].x},${padY + chartH}Z`

  // Show labels at start, middle, end
  const labelIdxs = data.length <= 3
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 2), data.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {/* Horizontal grid */}
      {[0, 0.5, 1].map(f => (
        <line key={f} x1={padX} y1={padY + f * chartH} x2={W - padX} y2={padY + f * chartH}
          stroke="#1e2235" strokeWidth="1" />
      ))}
      {/* Area fill */}
      <path d={areaD} fill={color} opacity="0.1" />
      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
      ))}
      {/* X labels */}
      {labelIdxs.map(i => (
        <text key={i} x={pts[i].x} y={H - 2} textAnchor="middle" fontSize="8" fill="#8892aa">
          {pts[i].label}
        </text>
      ))}
      {/* Y max */}
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
  const [showAllChurn, setShowAllChurn] = useState(false)
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [platformLoading, setPlatformLoading] = useState(true)
  const [msgLog, setMsgLog] = useState<MessageEntry[]>([])
  const [msgLoading, setMsgLoading] = useState(true)
  const [msgTotal, setMsgTotal] = useState(0)
  const [showAllMessages, setShowAllMessages] = useState(false)
  const [recentLogins, setRecentLogins] = useState<RecentLogin[]>([])
  const [loginsLoading, setLoginsLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

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

  useEffect(() => {
    loadMsgLog()
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

    // Auth + admin check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') { router.push('/dashboard/player'); return }

    const since = periodStart()
    const sinceIso = since.toISOString()

    // ── All-time totals ──────────────────────────────────────────────────────
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

    // ── Migration stats ──────────────────────────────────────────────────────
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

    // ── In-period counts ─────────────────────────────────────────────────────
    const signupsQ = supabase.from('profiles').select('created_at', { count: 'exact' })
      .gte('created_at', sinceIso).limit(1000)
    const viewsQ = supabase.from('player_views').select('viewed_at', { count: 'exact' })
      .gte('viewed_at', sinceIso).limit(1000)
    const appsQ = supabase.from('applications').select('created_at', { count: 'exact' })
      .gte('created_at', sinceIso)
    const postsQ = supabase.from('posts').select('created_at', { count: 'exact' })
      .eq('is_deleted', false).gte('created_at', sinceIso).limit(1000)

    const msgStatsUrl = `/api/admin/message-stats${sinceIso ? `?since=${encodeURIComponent(sinceIso)}` : ''}`

    const [signupsRes, viewsRes, appsRes, postsRes, msgStatsRes] = await Promise.all([
      signupsQ, viewsQ, appsQ, postsQ,
      fetch(msgStatsUrl).then(r => r.json()),
    ])

    // ── Time series ──────────────────────────────────────────────────────────
    const signupTs = (signupsRes.data ?? []).map((r: { created_at: string }) => r.created_at)
    const msgTs: string[] = msgStatsRes.messageTimestamps ?? []
    const viewTs = (viewsRes.data ?? []).map((r: { viewed_at: string }) => r.viewed_at)
    const postTs = (postsRes.data ?? []).map((r: { created_at: string }) => r.created_at)

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
      newSignups: signupsRes.count ?? 0,
      messagesSent: msgStatsRes.messagesSent ?? 0,
      newConversations: msgStatsRes.newConversations ?? 0,
      profileViews: viewsRes.count ?? 0,
      applicationsSubmitted: appsRes.count ?? 0,
      postsSent: postsRes.count ?? 0,
      signupSeries: buildSeries(signupTs),
      messageSeries: buildSeries(msgTs),
      viewSeries: buildSeries(viewTs),
      postSeries: buildSeries(postTs),
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

          {/* ── Insight Cards ─────────────────────────────────────────────────── */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Key Metrics</p>
            <div className="grid grid-cols-2 gap-2">
              <InsightCard
                label="Monthly Active Users"
                value={platformLoading ? '…' : (platformStats?.mau ?? 0)}
                color="#2d5fc4"
                trend={platformStats && platformStats.mau_prev > 0
                  ? { delta: platformStats.mau - platformStats.mau_prev, label: 'vs prev 30d' }
                  : null}
              />
              <InsightCard
                label="Players per Coach"
                value={platformLoading ? '…' : (
                  platformStats && platformStats.coach_count > 0
                    ? (platformStats.player_count / platformStats.coach_count).toFixed(1) + ':1'
                    : '—'
                )}
                color="#a78bfa"
                sub={platformStats ? `${platformStats.player_count}p · ${platformStats.coach_count}c` : undefined}
              />
              <InsightCard
                label="Coach Reply Rate"
                value={platformLoading ? '…' : (
                  platformStats?.reply_rate_pct != null
                    ? platformStats.reply_rate_pct + '%'
                    : '—'
                )}
                color="#60a5fa"
                sub={platformStats?.reply_total_convos
                  ? `${platformStats.reply_total_convos} convos (90d)`
                  : undefined}
              />
              <InsightCard
                label="Live Opportunities"
                value={platformLoading ? '…' : (platformStats?.open_opportunities ?? 0)}
                color="#f59e0b"
              />
            </div>
          </section>

          {/* ── Engagement Funnel ─────────────────────────────────────────────── */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Engagement Funnel</p>
            <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
              {platformLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="w-5 h-5 rounded-full border-2 animate-spin"
                    style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
                </div>
              ) : platformStats ? (() => {
                const base = platformStats.funnel.registered || 1
                const steps = [
                  { label: 'Registered',  value: platformStats.funnel.registered, color: '#2d5fc4' },
                  { label: 'Approved',    value: platformStats.funnel.approved,   color: '#3a6fda' },
                  { label: 'Active 30d',  value: platformStats.funnel.active_30d, color: '#60a5fa' },
                  { label: 'Premium',     value: platformStats.funnel.premium,    color: '#f59e0b' },
                ]
                return steps.map((step, i) => {
                  const pct = Math.round(step.value / base * 100)
                  return (
                    <div key={step.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs" style={{ color: '#8892aa' }}>{step.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black tabular-nums"
                            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: step.color }}>
                            {step.value.toLocaleString()}
                          </span>
                          {i > 0 && (
                            <span className="text-xs tabular-nums w-8 text-right"
                              style={{ color: '#3a4055' }}>{pct}%</span>
                          )}
                        </div>
                      </div>
                      <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#1e2235' }}>
                        <div className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: step.color }} />
                      </div>
                    </div>
                  )
                })
              })() : (
                <p className="text-xs text-center" style={{ color: '#8892aa' }}>No data</p>
              )}
            </div>
          </section>

          {/* All-time platform totals */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Platform Totals</p>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Total Users" value={stats.totalUsers} />
              <StatCard label="Premium Subscribers" value={stats.premiumCount} color="#f59e0b" />
              <StatCard label="Players" value={stats.totalPlayers} />
              <StatCard label="Coaches" value={stats.totalCoaches} />
            </div>
          </section>

          {/* Recent Logins */}
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
                <div className="divide-y" style={{ borderColor: '#1e2235' }}>
                  {recentLogins.map((u, i) => (
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
              )}
            </div>
          </section>

          {/* Revenue — Live from Stripe */}
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
                {/* MRR card */}
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

                  {/* Player / Coach breakdown */}
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

                  {/* Price tier breakdown — shows legacy vs current pricing split */}
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

                  {/* Legacy upgrade opportunity */}
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

                  {/* Conversion rate */}
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

                {/* MRR trend chart */}
                {revenueStats.mrr_trend.length > 0 && (
                  <ChartCard
                    title="MRR Trend (6 months)"
                    data={revenueStats.mrr_trend.map(d => ({ ...d, value: Math.round(d.value / 100) }))}
                    color="#f59e0b"
                    total={Math.round(revenueStats.mrr_pence / 100)}
                    valuePrefix="£"
                  />
                )}

                {/* Churn risk */}
                {revenueStats.churn_risk.length > 0 && (
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
                    <div className="px-4 py-2.5 flex items-center gap-2"
                      style={{ backgroundColor: '#13172a', borderBottom: '1px solid #1e2235' }}>
                      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#ef4444' }}>
                        Churn Risk
                      </p>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-bold"
                        style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                        {revenueStats.churn_risk.length} · 14+ days inactive
                      </span>
                    </div>
                    <div className="divide-y" style={{ borderColor: '#1e2235' }}>
                      {(showAllChurn ? revenueStats.churn_risk : revenueStats.churn_risk.slice(0, 5)).map((u, i) => (
                        <div key={u.id} className="flex items-center gap-3 px-4 py-3"
                          style={{ backgroundColor: i === 0 ? '#0d1020' : '#13172a' }}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>
                                {u.full_name ?? '—'}
                              </span>
                              <RoleBadge role={u.role} />
                            </div>
                            {u.club && (
                              <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>{u.club}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0 space-y-0.5">
                            <p className="text-xs" style={{ color: '#8892aa' }}>
                              {u.last_seen
                                ? `Last seen ${new Date(u.last_seen).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                                : 'Never signed in'}
                            </p>
                            {u.period_end && (
                              <p className="text-xs" style={{ color: '#3a4055' }}>
                                renews {new Date(u.period_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {revenueStats.churn_risk.length > 5 && (
                      <button
                        onClick={() => setShowAllChurn(v => !v)}
                        className="w-full px-4 py-2.5 text-xs font-semibold text-center transition-colors"
                        style={{
                          backgroundColor: '#0d1020',
                          borderTop: '1px solid #1e2235',
                          color: '#8892aa',
                        }}>
                        {showAllChurn
                          ? 'Show less'
                          : `See ${revenueStats.churn_risk.length - 5} more`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <p className="text-sm" style={{ color: '#8892aa' }}>Could not load Stripe data.</p>
              </div>
            )}
          </section>

          {/* ── Month-by-Month Table ──────────────────────────────────────────── */}
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
                          style={{ color: '#a78bfa' }}>Messages</th>
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

          {/* Migration tracker */}
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

          {/* Period stats */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>
              Last 30 Days
            </p>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="New Signups" value={stats.newSignups} color="#2d5fc4" />
              <StatCard label="Messages Sent" value={stats.messagesSent} color="#a78bfa" />
              <StatCard label="New Conversations" value={stats.newConversations} color="#a78bfa" />
              <StatCard label="Profile Views" value={stats.profileViews} color="#60a5fa" />
              <StatCard label="Applications" value={stats.applicationsSubmitted} color="#f59e0b" />
              <StatCard label="Posts" value={stats.postsSent} color="#34d399" />
            </div>
          </section>

          {/* Charts */}
          <section className="space-y-3">
            <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Trends</p>
            <ChartCard
              title="New Signups"
              data={stats.signupSeries}
              color="#2d5fc4"
              total={stats.newSignups}
            />
            <ChartCard
              title="Messages Sent"
              data={stats.messageSeries}
              color="#a78bfa"
              total={stats.messagesSent}
            />
            <ChartCard
              title="Profile Views"
              data={stats.viewSeries}
              color="#60a5fa"
              total={stats.profileViews}
            />
            <ChartCard
              title="Community Posts"
              data={stats.postSeries}
              color="#34d399"
              total={stats.postsSent}
            />
          </section>

          {/* Message Log */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>Message Log</p>
              {msgTotal > 0 && (
                <span className="text-xs" style={{ color: '#8892aa' }}>
                  {msgTotal.toLocaleString()} total
                </span>
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
                    style={{
                      backgroundColor: '#0d1020',
                      borderTop: '1px solid #1e2235',
                      color: '#8892aa',
                    }}>
                    {showAllMessages ? 'Show less' : `See ${msgLog.length - 5} more recent`}
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
