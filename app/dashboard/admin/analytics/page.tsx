'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { HeroRow } from './_components/HeroRow'
import { MarketplaceHealthRow } from './_components/MarketplaceHealth'
import { LeadingIndicatorsRow } from './_components/LeadingIndicators'
import { TrackerAdoptionTrends } from './_components/TrackerAdoptionTrends'
import { RevenueSection } from './_components/RevenueSection'
import { MonthByMonth } from './_components/MonthByMonth'
import { ActivityTrends } from './_components/ActivityTrends'
import { AcquisitionChart } from './_components/AcquisitionChart'
import { EngagementChart } from './_components/EngagementChart'
import { ApplicationOutcomesChart } from './_components/ApplicationOutcomesChart'
import { CohortRetentionGrid } from './_components/CohortRetentionGrid'
import { OpsTab } from './_components/OpsTab'
import { CoachLeaderboardTab } from './_components/CoachLeaderboard'
import { EventFeedTab } from './_components/EventFeed'
import { ConversionIntelligenceSection } from './_components/ConversionIntelligence'
import { PricingTierBreakdown } from './_components/PricingTierBreakdown'
import { PlayerStatusDonut } from './_components/PlayerStatusDonut'
import { PlayerViewsChart } from './_components/PlayerViewsChart'
import type { PlayerViewsMonth } from './_components/PlayerViewsChart'
import { LoadingCard } from './_components/ui'
import type {
  RevenueStats, PlatformStats, TrackerStats, RecentLogin,
  MessageEntry, RecentApplication, MessageStats,
  CoachLeaderboard, HeroStats, MarketplaceHealthStats,
  ConversionIntelligence, OutcomeMonth, CohortRow,
} from './_components/types'

type StatusCount = { status: string; count: number; pct: number }

type Tab = 'overview' | 'revenue' | 'trends' | 'coaches' | 'feed' | 'ops'

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  revenue: 'Revenue',
  trends: 'Trends',
  coaches: 'Coaches',
  feed: 'Feed',
  ops: 'Ops',
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')

  // ── Eager: Overview tab data ────────────────────────────────────────────
  // platformStats is also needed by Revenue (chart data) and Ops (migration
  // tracker), so it fetches up front rather than per-tab.
  const [heroStats, setHeroStats] = useState<HeroStats | null>(null)
  const [heroLoading, setHeroLoading] = useState(true)
  const [marketplaceHealth, setMarketplaceHealth] = useState<MarketplaceHealthStats | null>(null)
  const [marketplaceHealthLoading, setMarketplaceHealthLoading] = useState(true)
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [platformLoading, setPlatformLoading] = useState(true)

  // ── Lazy: Revenue tab ────────────────────────────────────────────────────
  const [revenueRequested, setRevenueRequested] = useState(false)
  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [conversionIntel, setConversionIntel] = useState<ConversionIntelligence | null>(null)
  const [conversionIntelLoading, setConversionIntelLoading] = useState(false)

  // ── Lazy: Trends tab ─────────────────────────────────────────────────────
  const [trendsRequested, setTrendsRequested] = useState(false)
  const [trackerStats, setTrackerStats] = useState<TrackerStats | null>(null)
  const [trackerLoading, setTrackerLoading] = useState(false)
  const [appOutcomes, setAppOutcomes] = useState<OutcomeMonth[]>([])
  const [appOutcomesLoading, setAppOutcomesLoading] = useState(false)
  const [cohortData, setCohortData] = useState<CohortRow[]>([])
  const [cohortLoading, setCohortLoading] = useState(false)
  const [playerStatus, setPlayerStatus] = useState<StatusCount[]>([])
  const [playerStatusTotal, setPlayerStatusTotal] = useState(0)
  const [playerStatusLoading, setPlayerStatusLoading] = useState(false)

  // ── Lazy: Coaches tab ────────────────────────────────────────────────────
  const [coachBoard, setCoachBoard] = useState<CoachLeaderboard | null>(null)
  const [coachBoardLoading, setCoachBoardLoading] = useState(false)
  const [coachBoardRequested, setCoachBoardRequested] = useState(false)
  const [playerViews, setPlayerViews] = useState<PlayerViewsMonth[]>([])
  const [playerViewsLoading, setPlayerViewsLoading] = useState(false)

  // ── Lazy: Ops tab ─────────────────────────────────────────────────────────
  const [opsRequested, setOpsRequested] = useState(false)
  const [msgLog, setMsgLog] = useState<MessageEntry[]>([])
  const [msgLoading, setMsgLoading] = useState(false)
  const [msgTotal, setMsgTotal] = useState(0)
  const [recentLogins, setRecentLogins] = useState<RecentLogin[]>([])
  const [loginsLoading, setLoginsLoading] = useState(false)
  const [recentApps, setRecentApps] = useState<RecentApplication[]>([])
  const [appsLoading, setAppsLoading] = useState(false)
  const [messageStats, setMessageStats] = useState<MessageStats | null>(null)
  const [messageStatsLoading, setMessageStatsLoading] = useState(false)

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

  // ── Eager fetches ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/admin/hero-stats')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setHeroStats(d); setHeroLoading(false) })
      .catch(() => setHeroLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/admin/marketplace-health')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setMarketplaceHealth(d); setMarketplaceHealthLoading(false) })
      .catch(() => setMarketplaceHealthLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/admin/platform-stats')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setPlatformStats(d); setPlatformLoading(false) })
      .catch(() => setPlatformLoading(false))
  }, [])

  // ── Lazy: Revenue ───────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'revenue' || revenueRequested) return
    setRevenueRequested(true)
    setRevenueLoading(true)
    setConversionIntelLoading(true)
    fetch('/api/admin/revenue-stats')
      .then(r => r.json())
      .then(d => { setRevenueStats(d); setRevenueLoading(false) })
      .catch(() => setRevenueLoading(false))
    fetch('/api/admin/conversion-intelligence')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setConversionIntel(d); setConversionIntelLoading(false) })
      .catch(() => setConversionIntelLoading(false))
  }, [tab, revenueRequested])

  // ── Lazy: Trends ────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'trends' || trendsRequested) return
    setTrendsRequested(true)
    setTrackerLoading(true)
    setAppOutcomesLoading(true)
    setCohortLoading(true)
    setPlayerStatusLoading(true)
    fetch('/api/admin/tracker-stats')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setTrackerStats(d); setTrackerLoading(false) })
      .catch(() => setTrackerLoading(false))
    fetch('/api/admin/application-outcomes')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setAppOutcomes(d); setAppOutcomesLoading(false) })
      .catch(() => setAppOutcomesLoading(false))
    fetch('/api/admin/cohort-retention')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setCohortData(d); setCohortLoading(false) })
      .catch(() => setCohortLoading(false))
    fetch('/api/admin/player-status-distribution')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setPlayerStatus(d.distribution ?? []); setPlayerStatusTotal(d.total ?? 0); setPlayerStatusLoading(false) })
      .catch(() => setPlayerStatusLoading(false))
  }, [tab, trendsRequested])

  // ── Lazy: Coaches ───────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'coaches' || coachBoardRequested) return
    setCoachBoardRequested(true)
    setCoachBoardLoading(true)
    setPlayerViewsLoading(true)
    fetch('/api/admin/coach-leaderboard')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setCoachBoard(d); setCoachBoardLoading(false) })
      .catch(() => setCoachBoardLoading(false))
    fetch('/api/admin/player-views-monthly')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setPlayerViews(d); setPlayerViewsLoading(false) })
      .catch(() => setPlayerViewsLoading(false))
  }, [tab, coachBoardRequested])

  // ── Lazy: Ops ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'ops' || opsRequested) return
    setOpsRequested(true)
    setMsgLoading(true)
    setLoginsLoading(true)
    setAppsLoading(true)
    setMessageStatsLoading(true)
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    fetch(`/api/admin/message-stats?since=${encodeURIComponent(since)}`)
      .then(r => r.json())
      .then(d => { setMessageStats(d); setMessageStatsLoading(false) })
      .catch(() => setMessageStatsLoading(false))
    fetch('/api/admin/recent-logins')
      .then(r => r.json())
      .then(d => { setRecentLogins(d.logins ?? []); setLoginsLoading(false) })
      .catch(() => setLoginsLoading(false))
    fetch('/api/admin/messages?page=0')
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => { setMsgLog(d.messages ?? []); setMsgTotal(d.total ?? 0); setMsgLoading(false) })
      .catch(() => setMsgLoading(false))
    fetch('/api/admin/recent-applications')
      .then(r => r.json())
      .then(d => { setRecentApps(d.applications ?? []); setAppsLoading(false) })
      .catch(() => setAppsLoading(false))
  }, [tab, opsRequested])

  if (!authChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <div className="pb-8">
      {/* Sticky header + tab bar */}
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
          <h1 className="text-2xl font-black uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Analytics
          </h1>
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          {(['overview', 'revenue', 'trends', 'coaches', 'feed', 'ops'] as Tab[]).map(t => (
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

      {/* ── Overview ── core numbers + marketplace pulse ─────────────────── */}
      {tab === 'overview' && (
        <div className="px-4 pt-4 space-y-4">
          {heroLoading || !heroStats
            ? <LoadingCard />
            : <HeroRow heroStats={heroStats} monthly={platformStats?.monthly_table} />}
          {marketplaceHealthLoading || !marketplaceHealth
            ? <LoadingCard />
            : <MarketplaceHealthRow health={marketplaceHealth} monthly={platformStats?.monthly_table} />}
        </div>
      )}

      {/* ── Revenue ── MRR, churn, conversion funnel ─────────────────────── */}
      {tab === 'revenue' && (
        <div className="px-4 pt-4 space-y-4">
          {revenueLoading || !revenueStats || platformLoading || !platformStats
            ? <LoadingCard />
            : (
              <>
                <RevenueSection revenueStats={revenueStats} platformStats={platformStats} />
                <PricingTierBreakdown priceBreakdown={revenueStats.price_breakdown} />
                {conversionIntelLoading
                  ? <LoadingCard />
                  : conversionIntel
                    ? <ConversionIntelligenceSection data={conversionIntel} timeToUpgrade={revenueStats.time_to_upgrade} />
                    : null}
              </>
            )}
        </div>
      )}

      {/* ── Trends ── tracker adoption, leading indicators, monthly chart ── */}
      {tab === 'trends' && (
        <div className="px-4 pt-4 space-y-4">
          <LeadingIndicatorsRow trackerStats={trackerLoading ? null : trackerStats} />
          <TrackerAdoptionTrends trackerStats={trackerLoading ? null : trackerStats} />
          {platformLoading || !platformStats
            ? <LoadingCard />
            : (
              <>
                <AcquisitionChart monthly={platformStats.monthly_table} />
                <EngagementChart monthly={platformStats.monthly_table} />
                <ActivityTrends monthly={platformStats.monthly_table} />
                {appOutcomesLoading ? <LoadingCard /> : <ApplicationOutcomesChart data={appOutcomes} />}
                {playerStatusLoading ? <LoadingCard /> : playerStatus.length > 0
                  ? <PlayerStatusDonut distribution={playerStatus} total={playerStatusTotal} />
                  : null}
                {cohortLoading ? <LoadingCard /> : <CohortRetentionGrid data={cohortData} />}
                <MonthByMonth monthly={platformStats.monthly_table} />
              </>
            )}
        </div>
      )}

      {/* ── Coaches ── browsing behavior + leaderboard ───────────────────── */}
      {tab === 'coaches' && (
        <>
          <div className="px-4 pt-4">
            {playerViewsLoading
              ? <LoadingCard />
              : <PlayerViewsChart data={playerViews} />}
          </div>
          <CoachLeaderboardTab data={coachBoard} loading={coachBoardLoading || !coachBoardRequested} />
        </>
      )}

      {/* ── Feed ── reverse-chrono event stream ──────────────────────────── */}
      {tab === 'feed' && <EventFeedTab />}

      {/* ── Ops ── messages, logins, applications, showcase, email stats ─── */}
      {tab === 'ops' && (
        <OpsTab
          msgLog={msgLog} msgLoading={msgLoading} msgTotal={msgTotal}
          recentLogins={recentLogins} loginsLoading={loginsLoading}
          recentApps={recentApps} appsLoading={appsLoading}
          messageStats={messageStats} messageStatsLoading={messageStatsLoading}
          platformStats={platformStats}
        />
      )}
    </div>
  )
}
