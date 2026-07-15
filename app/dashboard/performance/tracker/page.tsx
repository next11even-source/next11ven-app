'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Breadcrumb from '@/app/components/Breadcrumb'
import { statAccent } from '../_components/statAccents'
import PreseasonToggle from '../_components/PreseasonToggle'
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
  access: 'full' | 'readonly'
  category: string | null
  focus: 'defensive' | 'attacking'
  includePreseason: boolean
  preseasonLogged: boolean
  competitive: MatchSummary
  friendlies: MatchSummary
  trend: 'up' | 'down' | 'flat' | null
  insight: { id: string; text: string; tone: 'streak' | 'best' | 'trend' } | null
  recent: PerformanceMatch[]
  activeStint: ClubStint | null
  stints: ClubStint[]
  target: { apps_target: number | null; goals_target: number | null; assists_target: number | null } | null
}

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// Insight banner accents by tone — streaks burn orange, peak moments get the
// amber star, trends keep the house blue. Text stays cream throughout.
const INSIGHT_TONES = {
  streak: {
    accent: '#f97316',
    background: 'linear-gradient(135deg, rgba(249,115,22,0.16) 0%, rgba(249,115,22,0.05) 100%)',
    border: '1px solid rgba(249,115,22,0.45)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
    ),
  },
  best: {
    accent: '#f59e0b',
    background: 'linear-gradient(135deg, rgba(245,158,11,0.16) 0%, rgba(245,158,11,0.05) 100%)',
    border: '1px solid rgba(245,158,11,0.45)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  trend: {
    accent: '#3a6fda',
    background: 'linear-gradient(135deg, rgba(45,95,196,0.18) 0%, rgba(45,95,196,0.06) 100%)',
    border: '1px solid rgba(45,95,196,0.4)',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3a6fda" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
} as const

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
function MotmBadge() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function MatchCard({ m }: { m: PerformanceMatch }) {
  const hasScore = m.goals_for != null && m.goals_against != null
  const outcome = hasScore
    ? m.goals_for! > m.goals_against! ? 'W' : m.goals_for! === m.goals_against! ? 'D' : 'L'
    : null
  const inv = m.goals + m.assists
  const isMotm = m.tags?.includes('man_of_the_match')

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
          <p className="text-sm font-bold truncate flex items-center gap-1.5" style={{ color: '#e8dece' }}>
            vs {m.opponent}
            {isMotm && <MotmBadge />}
          </p>
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
      supabase.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => {
          if (!data) return
          const isPlayer = data.role === 'player' || data.role === 'admin'
          if (!isPlayer) { router.push('/dashboard/coach'); return }
          // Reads are never premium-gated — the API decides full vs readonly
          loadSummary()
        })
    })
  }, [router, loadSummary])

  const s = summary
  const readonly = s?.access === 'readonly'
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
            {s && hasMatches && (
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
          {s && s.seasons.length > 1 && (
            <select value={s.season}
              onChange={e => loadSummary(parseInt(e.target.value, 10))}
              className="rounded-xl px-2.5 py-2 text-xs font-bold outline-none appearance-none cursor-pointer flex-shrink-0"
              style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}>
              {s.seasons.map(y => <option key={y} value={y}>{fmtSeason(y)}</option>)}
            </select>
          )}
        </div>

        {loading && (
          <div className="rounded-2xl p-8 text-center" style={surface}>
            <p className="text-sm" style={{ color: '#8892aa' }}>Loading your season…</p>
          </div>
        )}

        {/* No data + no write access = the full sell */}
        {!loading && s && readonly && !hasMatches && <LockedState />}

        {!loading && s && !readonly && !hasMatches && (
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

        {!loading && s && hasMatches && (
          <>
            {/* Log match — the one loud CTA on the page. Read-only players
                (post-premium-flip) keep their history but logging is the paid
                action, so the button becomes the upgrade. */}
            {readonly ? (
              <Link href="/dashboard/player/premium"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider"
                style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Log your next match · Premium
              </Link>
            ) : (
              <Link href="/dashboard/performance/tracker/log"
                className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider"
                style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Log a match
              </Link>
            )}

            {/* Hero — clean sheets for GK/DEF, goal involvements for MID/ATT */}
            <div className="rounded-2xl px-5 py-5" style={surface}>
              <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>
                {s.focus === 'defensive' ? 'Clean sheets' : 'Goal involvements'} · {s.seasonLabel}
              </p>
              <div className="flex items-end gap-3 mt-1">
                <span className="text-6xl font-black leading-none"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                  {s.focus === 'defensive' ? s.competitive.cleanSheets : s.competitive.involvements}
                </span>
                <div className="pb-1.5">
                  <p className="text-xs" style={{ color: '#8892aa' }}>
                    {s.focus === 'defensive'
                      ? `${plural(s.competitive.involvements, 'goal involvement')}${s.competitive.avgMinutes != null ? ` · ${s.competitive.avgMinutes} mins a game` : ''}`
                      : `${plural(s.competitive.goals, 'goal')} · ${plural(s.competitive.assists, 'assist')}`}
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

            {/* Insight banner — accent follows the insight's tone. Read-only
                players get the locked teaser instead (the FOMO surface —
                insight text is never sent to them). */}
            {readonly ? (
              <Link href="/dashboard/player/premium"
                className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
                style={{ background: 'linear-gradient(135deg, rgba(45,95,196,0.18) 0%, rgba(45,95,196,0.06) 100%)', border: '1px solid rgba(45,95,196,0.4)', textDecoration: 'none' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3a6fda" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <p className="text-sm font-semibold leading-snug" style={{ color: '#e8dece' }}>
                  Your insights are locked — streaks, personal bests, form trends. <span style={{ color: '#3a6fda' }}>Unlock with Premium</span>
                </p>
              </Link>
            ) : s.insight && (() => {
              const tone = INSIGHT_TONES[s.insight.tone] ?? INSIGHT_TONES.trend
              return (
                <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
                  style={{ background: tone.background, border: tone.border }}>
                  {tone.icon}
                  <p className="text-sm font-semibold leading-snug" style={{ color: '#e8dece' }}>{s.insight.text}</p>
                </div>
              )
            })()}

            {/* Pre-season toggle — only worth showing once there's something
                to fold in. Auto-on the moment they've logged a non-competitive
                match; pinned once they've chosen either way (server-side). */}
            {s.preseasonLogged && (
              <PreseasonToggle
                included={s.includePreseason}
                onChange={() => loadSummary(s.season)}
              />
            )}

            {/* Season grid — competitive only (or +pre-season/friendlies when toggled on), position-aware */}
            <div className="grid grid-cols-4 gap-2">
              {(s.focus === 'defensive'
                ? [
                    { label: 'Apps', value: s.competitive.apps },
                    { label: 'Clean sheets', value: s.competitive.cleanSheets },
                    s.category === 'goalkeepers'
                      ? { label: 'Pen saves', value: s.competitive.penaltySaves }
                      : { label: 'G + A', value: s.competitive.involvements },
                    { label: 'Avg rating', value: s.competitive.avgRating ?? '—' },
                  ]
                : [
                    { label: 'Apps', value: s.competitive.apps },
                    { label: 'Goals', value: s.competitive.goals },
                    { label: 'Assists', value: s.competitive.assists },
                    { label: 'Avg rating', value: s.competitive.avgRating ?? '—' },
                  ]
              ).map(({ label, value }) => {
                const a = statAccent(label)
                return (
                  <div key={label} className="rounded-2xl px-2 py-3.5 text-center"
                    style={{ background: a.background, border: a.border }}>
                    <p className="text-2xl font-black leading-none"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", color: a.fg }}>
                      {value}
                    </p>
                    <p className="mt-1.5 uppercase tracking-wider font-semibold" style={{ color: '#8892aa', fontSize: 10 }}>{label}</p>
                  </div>
                )
              })}
            </div>

            {/* Man of the match — season total, only shown when it's happened */}
            {s.competitive.motmCount > 0 && (
              <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3"
                style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.16) 0%, rgba(245,158,11,0.05) 100%)', border: '1px solid rgba(245,158,11,0.45)' }}>
                <MotmBadge />
                <p className="text-sm font-semibold leading-snug" style={{ color: '#e8dece' }}>
                  {plural(s.competitive.motmCount, 'Man of the match award')} this season
                </p>
              </div>
            )}

            {/* Minutes row — the reliability story, for every position */}
            {s.competitive.minutesApps > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Minutes played', value: s.competitive.minutes.toLocaleString('en-GB') },
                  { label: 'Avg per game', value: s.competitive.avgMinutes != null ? `${s.competitive.avgMinutes}'` : '—' },
                  { label: 'Starts', value: `${s.competitive.starts}/${s.competitive.apps}` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-2xl px-2 py-3 text-center" style={surface}>
                    <p className="text-lg font-black leading-none"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                      {value}
                    </p>
                    <p className="mt-1 uppercase tracking-wider font-semibold" style={{ color: '#8892aa', fontSize: 9 }}>{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Clean-sheet nudge — only when scores are missing for a defensive player */}
            {s.focus === 'defensive' && s.competitive.apps > 0 && s.competitive.scoredApps < s.competitive.apps && (
              <p className="text-xs px-1" style={{ color: '#8892aa' }}>
                Add match scores when you log — that&apos;s how clean sheets get counted.
              </p>
            )}

            {/* Friendlies / pre-season line — outside the headline numbers */}
            {s.friendlies.apps > 0 && (
              <p className="text-xs px-1" style={{ color: '#8892aa' }}>
                Plus {s.friendlies.apps} pre-season & friendly game{s.friendlies.apps === 1 ? '' : 's'} · {plural(s.friendlies.goals, 'goal')} · {plural(s.friendlies.assists, 'assist')}
              </p>
            )}

            {/* Season target progress */}
            {s.target && (s.target.apps_target != null || s.target.goals_target != null || s.target.assists_target != null) && (
              <div className="rounded-2xl p-4 space-y-3" style={surface}>
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>
                    Season target
                  </p>
                  <Link href="/dashboard/performance/tracker/target" className="text-xs font-semibold"
                    style={{ color: '#3a6fda', textDecoration: 'none' }}>
                    Edit
                  </Link>
                </div>
                {([
                  { label: 'Apps', current: s.competitive.apps, target: s.target.apps_target },
                  { label: 'Goals', current: s.competitive.goals, target: s.target.goals_target },
                  { label: 'Assists', current: s.competitive.assists, target: s.target.assists_target },
                ] as const).filter(row => row.target != null).map(row => {
                  const pct = Math.min(1, row.current / row.target!)
                  const hit = row.current >= row.target!
                  return (
                    <div key={row.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold" style={{ color: '#e8dece' }}>{row.label}</span>
                        <span className="text-xs font-bold" style={{ color: hit ? '#3a6fda' : '#8892aa' }}>
                          {row.current} / {row.target}{hit && ' · hit'}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: '#0d1020' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: '#2d5fc4' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Season wrap + target links — locked for read-only players */}
            <div className="grid grid-cols-2 gap-2">
              <Link href={readonly ? '/dashboard/player/premium' : `/dashboard/performance/tracker/season?season=${s.season}`}
                className="flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider"
                style={{ ...surface, color: '#e8dece', textDecoration: 'none' }}>
                {readonly && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                Season wrap
              </Link>
              <Link href={readonly ? '/dashboard/player/premium' : '/dashboard/performance/tracker/target'}
                className="flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider"
                style={{ ...surface, color: '#e8dece', textDecoration: 'none' }}>
                {readonly && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                {s.target ? 'Edit target' : 'Set a target'}
              </Link>
            </div>

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
