'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = '7d' | '30d' | '90d' | 'all'

type DayPoint = { label: string; value: number }

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
  // Time series
  signupSeries: DayPoint[]
  messageSeries: DayPoint[]
  viewSeries: DayPoint[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodStart(p: Period): Date | null {
  if (p === 'all') return null
  const days = p === '7d' ? 7 : p === '30d' ? 30 : 90
  return new Date(Date.now() - days * 86400000)
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

function bucketWeeks(rows: string[], weeks: number): DayPoint[] {
  const now = Date.now()
  const buckets: Record<string, number> = {}
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(now - i * 7 * 86400000)
    buckets[weekKey(d)] = 0
  }
  for (const ts of rows) {
    const d = new Date(ts)
    const k = weekKey(d)
    if (k in buckets) buckets[k] = (buckets[k] ?? 0) + 1
  }
  return Object.entries(buckets).map(([label, value]) => ({ label, value }))
}

function bucketMonths(rows: string[]): DayPoint[] {
  const buckets: Record<string, number> = {}
  for (const ts of rows) {
    const d = new Date(ts)
    const k = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    buckets[k] = (buckets[k] ?? 0) + 1
  }
  return Object.entries(buckets).map(([label, value]) => ({ label, value }))
}

function dayKey(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function weekKey(d: Date) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function buildSeries(timestamps: string[], period: Period): DayPoint[] {
  if (period === '7d') return bucketDays(timestamps, 7)
  if (period === '30d') return bucketDays(timestamps, 30)
  if (period === '90d') return bucketWeeks(timestamps, 13)
  return bucketMonths(timestamps)
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

function ChartCard({ title, data, color, total }: {
  title: string; data: DayPoint[]; color: string; total: number
}) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{title}</p>
        <span className="text-sm font-black" style={{ color, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {total.toLocaleString()}
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

const MSG_PAGE_SIZE = 20

export default function AnalyticsPage() {
  const router = useRouter()
  const [period, setPeriod] = useState<Period>('30d')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [msgLog, setMsgLog] = useState<MessageEntry[]>([])
  const [msgLoading, setMsgLoading] = useState(true)
  const [msgPage, setMsgPage] = useState(0)
  const [msgTotal, setMsgTotal] = useState(0)

  useEffect(() => {
    load(period)
  }, [period])

  useEffect(() => {
    loadMsgLog(msgPage)
  }, [msgPage])

  async function loadMsgLog(page: number) {
    setMsgLoading(true)
    const supabase = createClient()
    const offset = page * MSG_PAGE_SIZE

    const { data: msgs, count } = await supabase
      .from('messages')
      .select('id, content, created_at, sender_id, conversation_id, conversations(coach_id, player_id)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + MSG_PAGE_SIZE - 1)

    if (!msgs || msgs.length === 0) {
      setMsgLog([])
      setMsgTotal(count ?? 0)
      setMsgLoading(false)
      return
    }

    setMsgTotal(count ?? 0)

    type ConvRow = { coach_id: string; player_id: string }

    const userIds = [...new Set(msgs.flatMap(m => {
      const raw = m.conversations
      const conv = (Array.isArray(raw) ? raw[0] : raw) as ConvRow | null | undefined
      if (!conv) return [m.sender_id]
      return [m.sender_id, conv.coach_id, conv.player_id]
    }))]

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, club, role')
      .in('id', userIds)

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

    const entries: MessageEntry[] = msgs.map(m => {
      const raw = m.conversations
      const conv = (Array.isArray(raw) ? raw[0] : raw) as ConvRow | null | undefined
      const sender = profileMap[m.sender_id] as { full_name: string | null; club: string | null; role: string | null } | undefined
      const otherId = conv
        ? (conv.coach_id === m.sender_id ? conv.player_id : conv.coach_id)
        : null
      const other = otherId ? profileMap[otherId] as { full_name: string | null; club: string | null; role: string | null } | undefined : undefined
      return {
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        sender_name: sender?.full_name ?? null,
        sender_club: sender?.club ?? null,
        sender_role: sender?.role ?? null,
        other_name: other?.full_name ?? null,
        other_club: other?.club ?? null,
        other_role: other?.role ?? null,
      }
    })

    setMsgLog(entries)
    setMsgLoading(false)
  }

  async function load(p: Period) {
    setLoading(true)
    const supabase = createClient()

    // Auth + admin check
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/'); return }
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (me?.role !== 'admin') { router.push('/dashboard/player'); return }

    const since = periodStart(p)
    const sinceIso = since?.toISOString()

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
    let signupsQ = supabase.from('profiles').select('created_at', { count: 'exact' })
    let msgsQ = supabase.from('messages').select('created_at', { count: 'exact' })
    let convsQ = supabase.from('conversations').select('created_at', { count: 'exact' })
    let viewsQ = supabase.from('player_views').select('viewed_at', { count: 'exact' })
    let appsQ = supabase.from('applications').select('created_at', { count: 'exact' })

    if (sinceIso) {
      signupsQ = signupsQ.gte('created_at', sinceIso)
      msgsQ = msgsQ.gte('created_at', sinceIso)
      convsQ = convsQ.gte('created_at', sinceIso)
      viewsQ = viewsQ.gte('viewed_at', sinceIso)
      appsQ = appsQ.gte('created_at', sinceIso)
    }

    // Cap at 1000 rows for time series (avoids Supabase page limit silently truncating)
    signupsQ = signupsQ.limit(1000)
    msgsQ = msgsQ.limit(1000)
    viewsQ = viewsQ.limit(1000)

    const [signupsRes, msgsRes, convsRes, viewsRes, appsRes] = await Promise.all([
      signupsQ, msgsQ, convsQ, viewsQ, appsQ,
    ])

    // ── Time series ──────────────────────────────────────────────────────────
    const signupTs = (signupsRes.data ?? []).map((r: { created_at: string }) => r.created_at)
    const msgTs = (msgsRes.data ?? []).map((r: { created_at: string }) => r.created_at)
    const viewTs = (viewsRes.data ?? []).map((r: { viewed_at: string }) => r.viewed_at)

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
      messagesSent: msgsRes.count ?? 0,
      newConversations: convsRes.count ?? 0,
      profileViews: viewsRes.count ?? 0,
      applicationsSubmitted: appsRes.count ?? 0,
      signupSeries: buildSeries(signupTs, p),
      messageSeries: buildSeries(msgTs, p),
      viewSeries: buildSeries(viewTs, p),
    })
    setLoading(false)
  }

  const PERIODS: { key: Period; label: string }[] = [
    { key: '7d', label: '7D' },
    { key: '30d', label: '30D' },
    { key: '90d', label: '90D' },
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-3 pb-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center justify-between">
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
          {/* Period selector */}
          <div className="flex gap-1">
            {PERIODS.map(({ key, label }) => (
              <button key={key} onClick={() => setPeriod(key)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  backgroundColor: period === key ? '#2d5fc4' : '#13172a',
                  color: period === key ? '#fff' : '#8892aa',
                  border: period === key ? 'none' : '1px solid #1e2235',
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
        </div>
      ) : stats ? (
        <div className="px-4 pt-4 space-y-4">

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

          {/* Revenue */}
          <section>
            <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>Revenue</p>
            <div className="rounded-xl p-4 space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
              {/* MRR */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#8892aa' }}>Est. MRR</p>
                  <p className="text-4xl font-black leading-none"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#f59e0b' }}>
                    £{(stats.mrrPence / 100).toFixed(2)}
                  </p>
                  <p className="text-xs mt-1" style={{ color: '#8892aa' }}>
                    £{(stats.mrrPence / 100 * 12).toFixed(0)} annualised
                  </p>
                </div>
                {stats.cancellingCount > 0 && (
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: '#8892aa' }}>Cancelling</p>
                    <p className="text-2xl font-black leading-none"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#ef4444' }}>
                      {stats.cancellingCount}
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#8892aa' }}>at period end</p>
                  </div>
                )}
              </div>
              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892aa' }}>Player Premium</p>
                  <p className="text-xl font-black leading-none"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                    {stats.premiumPlayers}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>£{(stats.premiumPlayers * 6.99).toFixed(2)}/mo</p>
                </div>
                <div className="rounded-lg p-3" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8892aa' }}>Coach Pro</p>
                  <p className="text-xl font-black leading-none"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#a78bfa' }}>
                    {stats.premiumCoaches}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>£{(stats.premiumCoaches * 9.99).toFixed(2)}/mo</p>
                </div>
              </div>
              {/* Conversion rate */}
              {stats.totalApproved > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs" style={{ color: '#8892aa' }}>Premium conversion</p>
                    <p className="text-xs font-bold" style={{ color: '#f59e0b' }}>
                      {Math.round((stats.premiumCount / stats.totalApproved) * 100)}%
                    </p>
                  </div>
                  <div className="w-full rounded-full h-1.5" style={{ backgroundColor: '#1e2235' }}>
                    <div className="h-1.5 rounded-full"
                      style={{ width: `${Math.round((stats.premiumCount / stats.totalApproved) * 100)}%`, backgroundColor: '#f59e0b' }} />
                  </div>
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
              {period === 'all' ? 'All Time Activity' : `Last ${period.replace('d', ' Days')} Activity`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="New Signups" value={stats.newSignups} color="#2d5fc4" />
              <StatCard label="Messages Sent" value={stats.messagesSent} color="#a78bfa" />
              <StatCard label="New Conversations" value={stats.newConversations} color="#a78bfa" />
              <StatCard label="Profile Views" value={stats.profileViews} color="#60a5fa" />
              <StatCard label="Applications" value={stats.applicationsSubmitted} color="#f59e0b" />
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
          </section>

          {/* Site visits note */}
          <section>
            <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
              <p className="text-sm font-bold mb-1" style={{ color: '#e8dece' }}>Page-Level Site Visits</p>
              <p className="text-xs leading-relaxed mb-3" style={{ color: '#8892aa' }}>
                The stats above are pulled from the database. For browser-level page visit data (sessions, bounce rate, geography), enable{' '}
                <strong style={{ color: '#e8dece' }}>Vercel Analytics</strong> — it's free and takes one minute to set up.
              </p>
              <div className="rounded-lg px-3 py-2 font-mono text-xs" style={{ backgroundColor: '#0a0a0a', color: '#2d5fc4' }}>
                npm install @vercel/analytics
              </div>
              <p className="text-xs mt-2" style={{ color: '#8892aa' }}>
                Then add <code style={{ color: '#e8dece' }}>&lt;Analytics /&gt;</code> to your root layout, and enable it in your Vercel project settings. Data appears in the Vercel dashboard instantly.
              </p>
            </div>
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
              <div className="space-y-2">
                {msgLog.map(m => (
                  <div key={m.id} className="rounded-xl p-3 space-y-2"
                    style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
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
                          {m.other_club && (
                            <span className="text-xs truncate" style={{ color: '#3a4055' }}>· {m.other_club}</span>
                          )}
                        </div>
                        <p className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>
                          {m.content.length > 120 ? m.content.slice(0, 120) + '…' : m.content}
                        </p>
                      </div>
                      <p className="text-xs flex-shrink-0 tabular-nums" style={{ color: '#3a4055' }}>
                        {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {' '}
                        {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Pagination */}
                {msgTotal > MSG_PAGE_SIZE && (
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-xs" style={{ color: '#8892aa' }}>
                      {msgPage * MSG_PAGE_SIZE + 1}–{Math.min((msgPage + 1) * MSG_PAGE_SIZE, msgTotal)} of {msgTotal.toLocaleString()}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setMsgPage(p => Math.max(0, p - 1))}
                        disabled={msgPage === 0}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-30"
                        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}>
                        Previous
                      </button>
                      <button
                        onClick={() => setMsgPage(p => p + 1)}
                        disabled={(msgPage + 1) * MSG_PAGE_SIZE >= msgTotal}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-30"
                        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}>
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

        </div>
      ) : null}
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
