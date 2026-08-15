'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { MarketplaceHealthRow } from './_components/MarketplaceHealth'
import { LeadingIndicatorsRow } from './_components/LeadingIndicators'
import { TrackerAdoptionTrends } from './_components/TrackerAdoptionTrends'
import { RevenueSection } from './_components/RevenueSection'
import { MonthByMonth } from './_components/MonthByMonth'
import { ContextStrip } from './_components/ContextStrip'
import { OpsTab } from './_components/OpsTab'
import { CoachLeaderboardTab } from './_components/CoachLeaderboard'
import { LoadingCard } from './_components/ui'
import type {
  RevenueStats, PlatformStats, TrackerStats, RecentLogin,
  MessageEntry, RecentApplication, ShowcaseWaitlist, MessageStats,
  CoachLeaderboard,
} from './_components/types'

type Tab = 'health' | 'coaches' | 'ops'

const TAB_LABELS: Record<Tab, string> = {
  health: 'Health',
  coaches: 'Coaches',
  ops: 'Ops',
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [tab, setTab] = useState<Tab>('health')

  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(true)
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [platformLoading, setPlatformLoading] = useState(true)
  const [trackerStats, setTrackerStats] = useState<TrackerStats | null>(null)
  const [trackerLoading, setTrackerLoading] = useState(true)

  const [msgLog, setMsgLog] = useState<MessageEntry[]>([])
  const [msgLoading, setMsgLoading] = useState(true)
  const [msgTotal, setMsgTotal] = useState(0)
  const [recentLogins, setRecentLogins] = useState<RecentLogin[]>([])
  const [loginsLoading, setLoginsLoading] = useState(true)
  const [recentApps, setRecentApps] = useState<RecentApplication[]>([])
  const [appsLoading, setAppsLoading] = useState(true)
  const [showcaseWaitlist, setShowcaseWaitlist] = useState<ShowcaseWaitlist | null>(null)
  const [showcaseLoading, setShowcaseLoading] = useState(true)
  const [messageStats, setMessageStats] = useState<MessageStats | null>(null)
  const [messageStatsLoading, setMessageStatsLoading] = useState(true)
  const [coachBoard, setCoachBoard] = useState<CoachLeaderboard | null>(null)
  const [coachBoardLoading, setCoachBoardLoading] = useState(false)
  const [coachBoardRequested, setCoachBoardRequested] = useState(false)

  // ── Admin gate ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/'); return }
      const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (me?.role !== 'admin') { router.push('/dashboard/player'); return }
      setAuthChecked(true)
    })()
  }, [router])

  // ── Data — every count/aggregate comes from the RPC-backed endpoints below.
  // No direct client-side profile counting: that was the source of numbers
  // disagreeing across sections (see analytics reframe).
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
    fetch('/api/admin/tracker-stats')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setTrackerStats(d); setTrackerLoading(false) })
      .catch(() => setTrackerLoading(false))
  }, [])

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    fetch(`/api/admin/message-stats?since=${encodeURIComponent(since)}`)
      .then(r => r.json())
      .then(d => { setMessageStats(d); setMessageStatsLoading(false) })
      .catch(() => setMessageStatsLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/admin/recent-logins')
      .then(r => r.json())
      .then(d => { setRecentLogins(d.logins ?? []); setLoginsLoading(false) })
      .catch(() => setLoginsLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/admin/messages?page=0')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setMsgLog(d.messages ?? []); setMsgTotal(d.total ?? 0); setMsgLoading(false) })
      .catch(() => setMsgLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/admin/recent-applications')
      .then(r => r.json())
      .then(d => { setRecentApps(d.applications ?? []); setAppsLoading(false) })
      .catch(() => setAppsLoading(false))
  }, [])

  // Coach leaderboard is the heaviest aggregate on the page and only matters
  // when the tab is open — fetch it on first visit, then keep it.
  useEffect(() => {
    if (tab !== 'coaches' || coachBoardRequested) return
    setCoachBoardRequested(true)
    setCoachBoardLoading(true)
    fetch('/api/admin/coach-leaderboard')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setCoachBoard(d); setCoachBoardLoading(false) })
      .catch(() => setCoachBoardLoading(false))
  }, [tab, coachBoardRequested])

  useEffect(() => {
    fetch('/api/admin/showcase-waitlist')
      .then(r => r.json())
      .then(d => { setShowcaseWaitlist(d); setShowcaseLoading(false) })
      .catch(() => setShowcaseLoading(false))
  }, [])

  const loading = !authChecked || platformLoading || revenueLoading

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-3 pb-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => window.dispatchEvent(new Event('player:sidebar:open'))}
            className="p-2 rounded-lg"
            style={{ color: '#8892aa' }}
            aria-label="Open menu">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="17" y2="6" /><line x1="3" y1="10" x2="17" y2="10" /><line x1="3" y1="14" x2="17" y2="14" />
            </svg>
          </button>
          <h1 className="text-2xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Analytics
          </h1>
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          {(['health', 'coaches', 'ops'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                backgroundColor: tab === t ? '#2d5fc4' : 'transparent',
                color: tab === t ? '#fff' : '#8892aa',
              }}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
        </div>
      ) : tab === 'coaches' ? (
        <CoachLeaderboardTab data={coachBoard} loading={coachBoardLoading || !coachBoardRequested} />
      ) : tab === 'ops' ? (
        <OpsTab
          msgLog={msgLog} msgLoading={msgLoading} msgTotal={msgTotal}
          recentLogins={recentLogins} loginsLoading={loginsLoading}
          recentApps={recentApps} appsLoading={appsLoading}
          showcaseWaitlist={showcaseWaitlist} showcaseLoading={showcaseLoading}
          messageStats={messageStats} messageStatsLoading={messageStatsLoading}
          platformStats={platformStats}
        />
      ) : platformStats && revenueStats ? (
        <HealthTab platformStats={platformStats} revenueStats={revenueStats} trackerStats={trackerStats} trackerLoading={trackerLoading} />
      ) : (
        <div className="px-4 pt-4"><LoadingCard /></div>
      )}
    </div>
  )
}

function HealthTab({ platformStats, revenueStats, trackerStats, trackerLoading }: {
  platformStats: PlatformStats
  revenueStats: RevenueStats
  trackerStats: TrackerStats | null
  trackerLoading: boolean
}) {
  const monthly = platformStats.monthly_table

  return (
    <div className="px-4 pt-4 space-y-4">
      <MarketplaceHealthRow platformStats={platformStats} />
      <LeadingIndicatorsRow platformStats={platformStats} trackerStats={trackerLoading ? null : trackerStats} />
      <TrackerAdoptionTrends trackerStats={trackerLoading ? null : trackerStats} />
      <RevenueSection revenueStats={revenueStats} platformStats={platformStats} />
      <MonthByMonth monthly={monthly} />

      <ContextStrip platformStats={platformStats} revenueStats={revenueStats} />
    </div>
  )
}
