'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Breadcrumb from '@/app/components/Breadcrumb'
import { createClient } from '@/lib/supabase-browser'
import { PREMIUM_PRICE_PER_MONTH, PREMIUM_PRICE_WEEKLY } from '@/lib/premiumContent'
import {
  COMPETITION_TYPE_LABELS,
  seasonLabel as fmtSeason,
  type ClubStint,
  type CompetitionType,
  type MatchSummary,
  type PerformanceMatch,
  STINT_TYPE_LABELS,
} from '@/lib/performance'

type Summary = {
  season: number
  seasonLabel: string
  seasons: number[]
  competitive: MatchSummary
  friendlies: MatchSummary
  trend: 'up' | 'down' | 'flat' | null
  insight: { id: string; text: string } | null
  recent: PerformanceMatch[]
  activeStint: ClubStint | null
  stints: ClubStint[]
  target: { apps_target: number | null; goals_target: number | null; assists_target: number | null } | null
}

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Locked state (free players) — same sell pattern as other premium surfaces ─
function LockedState() {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl overflow-hidden"
        style={{ border: '1px solid rgba(45,95,196,0.4)', background: 'linear-gradient(160deg, rgba(45,95,196,0.12) 0%, rgba(45,95,196,0.04) 100%)' }}>
        <div className="px-5 pt-5 pb-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(45,95,196,0.15)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h2 className="text-xl font-black uppercase leading-tight"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Your season, on the record
            </h2>
          </div>
          <p className="text-sm leading-relaxed mb-4" style={{ color: '#8892aa' }}>
            The Game Performance Tracker is a Premium feature. Log every game in under 30 seconds and build a season record that follows you — whatever club you&apos;re at.
          </p>
          <div className="space-y-2.5 mb-5">
            {[
              'Log goals, assists, minutes and your own rating after every game',
              'Season totals and form trends that build week by week',
              'Your full history stays with you when you change clubs',
              'Insights from your own numbers — streaks, personal bests, form',
            ].map(item => (
              <div key={item} className="flex items-start gap-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-sm" style={{ color: '#e8dece' }}>{item}</span>
              </div>
            ))}
          </div>
          <Link href="/dashboard/player/premium"
            className="block w-full text-center py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider"
            style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
            Unlock with Premium · {PREMIUM_PRICE_PER_MONTH}
          </Link>
          <p className="text-center text-xs mt-2" style={{ color: '#8892aa' }}>
            {PREMIUM_PRICE_WEEKLY}. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Match card ────────────────────────────────────────────────────────────────
function MatchCard({ m }: { m: PerformanceMatch }) {
  const hasScore = m.goals_for != null && m.goals_against != null
  const outcome = hasScore
    ? m.goals_for! > m.goals_against! ? 'W' : m.goals_for! === m.goals_against! ? 'D' : 'L'
    : null
  const inv = m.goals + m.assists

  return (
    <Link href={`/dashboard/performance/tracker/${m.id}`}
      className="block rounded-2xl px-4 py-3.5" style={{ ...surface, textDecoration: 'none' }}>
      <div className="flex items-center gap-3">
        {/* Result chip */}
        <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: outcome === 'W' ? 'rgba(45,95,196,0.18)' : '#0d1020',
            border: `1px solid ${outcome === 'W' ? 'rgba(45,95,196,0.5)' : '#1e2235'}`,
          }}>
          {hasScore ? (
            <>
              <span className="text-xs font-black leading-none" style={{ color: outcome === 'W' ? '#3a6fda' : '#e8dece' }}>{outcome}</span>
              <span className="leading-none mt-0.5" style={{ color: '#8892aa', fontSize: 10 }}>{m.goals_for}-{m.goals_against}</span>
            </>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="1.8">
              <circle cx="12" cy="12" r="10" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>vs {m.opponent}</p>
          <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
            {fmtDate(m.match_date)} · {COMPETITION_TYPE_LABELS[m.competition_type as CompetitionType] ?? m.competition_type}
            {m.position ? ` · ${m.position}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {inv > 0 && (
            <div className="text-right">
              <p className="text-sm font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                {m.goals > 0 && `${m.goals}G`}{m.goals > 0 && m.assists > 0 && ' '}{m.assists > 0 && `${m.assists}A`}
              </p>
            </div>
          )}
          {m.rating != null && (
            <span className="text-xs font-bold px-2 py-1 rounded-lg"
              style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#3a6fda' }}>
              {Number(m.rating).toFixed(1)}
            </span>
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3a4060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </div>
    </Link>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TrackerDashboardPage() {
  const router = useRouter()
  const [premium, setPremium] = useState<boolean | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const loadSummary = useCallback((season?: number) => {
    setLoading(true)
    fetch(`/api/performance/summary${season ? `?season=${season}` : ''}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data) setSummary(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      supabase.from('profiles').select('role, premium').eq('id', user.id).single()
        .then(({ data }) => {
          if (!data) return
          const isPlayer = data.role === 'player' || data.role === 'admin'
          if (!isPlayer) { router.push('/dashboard/coach'); return }
          setPremium(data.premium ?? false)
          if (data.premium) loadSummary()
          else setLoading(false)
        })
    })
  }, [router, loadSummary])

  const s = summary
  const hasMatches = (s?.recent.length ?? 0) > 0 || (s?.competitive.apps ?? 0) > 0 || (s?.seasons.length ?? 0) > 0

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="px-4 pt-3 pb-3" style={{ borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[
          { label: 'Home', href: '/dashboard/player' },
          { label: 'Game Performance Tracker' },
        ]} />
      </div>

      <div className="px-4 pt-6 max-w-lg mx-auto space-y-5">

        {/* Title */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black uppercase leading-tight"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Game Performance Tracker
            </h1>
            {premium && s && (
              <p className="text-sm mt-1" style={{ color: '#8892aa' }}>
                {s.activeStint
                  ? <>Playing for <span style={{ color: '#e8dece', fontWeight: 600 }}>{s.activeStint.club_name}</span>
                      {s.activeStint.stint_type !== 'contracted' && ` (${STINT_TYPE_LABELS[s.activeStint.stint_type]})`}
                      {s.activeStint.level && ` · ${s.activeStint.level}`}</>
                  : 'No active club — your record still counts'}
              </p>
            )}
          </div>
          {/* Season picker */}
          {premium && s && s.seasons.length > 1 && (
            <select value={s.season}
              onChange={e => loadSummary(parseInt(e.target.value, 10))}
              className="rounded-xl px-2.5 py-2 text-xs font-bold outline-none appearance-none cursor-pointer flex-shrink-0"
              style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}>
              {s.seasons.map(y => <option key={y} value={y}>{fmtSeason(y)}</option>)}
            </select>
          )}
        </div>

        {premium === false && <LockedState />}

        {premium && loading && (
          <div className="rounded-2xl p-8 text-center" style={surface}>
            <p className="text-sm" style={{ color: '#8892aa' }}>Loading your season…</p>
          </div>
        )}

        {premium && !loading && s && !hasMatches && (
          /* First-run empty state */
          <div className="rounded-2xl p-6 text-center space-y-4" style={surface}>
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center"
              style={{ backgroundColor: 'rgba(45,95,196,0.15)' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                Log your first match
              </p>
              <p className="text-sm mt-1.5 leading-relaxed" style={{ color: '#8892aa' }}>
                Under 30 seconds after every game. Your season builds from here — goals, assists, ratings and form, on the record for good.
              </p>
            </div>
            <Link href="/dashboard/performance/tracker/log"
              className="block w-full text-center py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider"
              style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
              Log a match
            </Link>
          </div>
        )}

        {premium && !loading && s && hasMatches && (
          <>
            {/* Log match — the one loud CTA on the page */}
            <Link href="/dashboard/performance/tracker/log"
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider"
              style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Log a match
            </Link>

            {/* Hero — goal involvements */}
            <div className="rounded-2xl px-5 py-5" style={surface}>
              <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>
                Goal involvements · {s.seasonLabel}
              </p>
              <div className="flex items-end gap-3 mt-1">
                <span className="text-6xl font-black leading-none"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                  {s.competitive.involvements}
                </span>
                <div className="pb-1.5">
                  <p className="text-xs" style={{ color: '#8892aa' }}>
                    {s.competitive.goals} goals · {s.competitive.assists} assists
                  </p>
                  {s.trend === 'up' && (
                    <p className="text-xs font-bold mt-0.5 flex items-center gap-1" style={{ color: '#3a6fda' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                      </svg>
                      Up on your previous 5 games
                    </p>
                  )}
                  {s.trend === 'flat' && (
                    <p className="text-xs font-semibold mt-0.5" style={{ color: '#8892aa' }}>Level with your previous 5</p>
                  )}
                </div>
              </div>
            </div>

            {/* Insight banner */}
            {s.insight && (
              <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
                style={{ background: 'linear-gradient(135deg, rgba(45,95,196,0.18) 0%, rgba(45,95,196,0.06) 100%)', border: '1px solid rgba(45,95,196,0.4)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3a6fda" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <p className="text-sm font-semibold leading-snug" style={{ color: '#e8dece' }}>{s.insight.text}</p>
              </div>
            )}

            {/* Season grid — competitive only */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Apps', value: s.competitive.apps },
                { label: 'Goals', value: s.competitive.goals },
                { label: 'Assists', value: s.competitive.assists },
                { label: 'Avg rating', value: s.competitive.avgRating ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-2xl px-2 py-3.5 text-center" style={surface}>
                  <p className="text-2xl font-black leading-none"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                    {value}
                  </p>
                  <p className="mt-1.5 uppercase tracking-wider font-semibold" style={{ color: '#8892aa', fontSize: 10 }}>{label}</p>
                </div>
              ))}
            </div>

            {/* Friendlies / pre-season line — outside the headline numbers */}
            {s.friendlies.apps > 0 && (
              <p className="text-xs px-1" style={{ color: '#8892aa' }}>
                Plus {s.friendlies.apps} pre-season & friendly game{s.friendlies.apps === 1 ? '' : 's'} · {s.friendlies.goals} goals · {s.friendlies.assists} assists
              </p>
            )}

            {/* Recent matches */}
            <div className="space-y-2.5">
              <p className="text-xs uppercase tracking-wider font-semibold px-1" style={{ color: '#8892aa' }}>Recent matches</p>
              {s.recent.map(m => <MatchCard key={m.id} m={m} />)}
            </div>

            {/* Own your record */}
            <div className="flex items-center justify-center pt-2 pb-4">
              <a href="/api/performance/export"
                className="text-xs flex items-center gap-1.5" style={{ color: '#8892aa', textDecoration: 'none' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Your record, yours to keep — download CSV
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
