'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Breadcrumb from '@/app/components/Breadcrumb'
import { statAccent } from '../../_components/statAccents'
import { createClient } from '@/lib/supabase-browser'
import {
  isCompetitive,
  seasonLabel,
  seasonStartYear,
  summariseMatches,
  dominantCategory,
  trackerFocus,
  type ClubStint,
  type MatchSummary,
  type PerformanceMatch,
} from '@/lib/performance'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }

function fmtShort(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Best 3-game spell by average rating (chronological window). The "most
// improved period" of the season, phrased positively.
function bestSpell(rated: PerformanceMatch[]): { avg: number; from: string; to: string } | null {
  if (rated.length < 4) return null
  let best: { avg: number; from: string; to: string } | null = null
  for (let i = 0; i + 3 <= rated.length; i++) {
    const window = rated.slice(i, i + 3)
    const avg = window.reduce((n, m) => n + Number(m.rating), 0) / 3
    if (!best || avg > best.avg) {
      best = { avg: Math.round(avg * 10) / 10, from: window[0].match_date, to: window[2].match_date }
    }
  }
  return best
}

function SeasonWrapInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const seasonParam = searchParams.get('season')
  const season = seasonParam && /^\d{4}$/.test(seasonParam) ? parseInt(seasonParam, 10) : seasonStartYear()

  const [name, setName] = useState<string | null>(null)
  const [profilePosition, setProfilePosition] = useState<string | null>(null)
  const [matches, setMatches] = useState<PerformanceMatch[] | null>(null)
  const [stints, setStints] = useState<ClubStint[]>([])
  const [shared, setShared] = useState(false)
  const [readonly, setReadonly] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('full_name, position').eq('id', user.id).single()
        .then(({ data }) => { setName(data?.full_name ?? null); setProfilePosition(data?.position ?? null) })
    })

    Promise.all([
      fetch(`/api/performance/matches?season=${season}&limit=200`).then(r => {
        if (r.status === 403) { router.push('/dashboard/performance/tracker'); return null }
        return r.ok ? r.json() : null
      }),
      fetch('/api/performance/stints').then(r => (r.ok ? r.json() : null)),
    ]).then(([matchesData, stintsData]) => {
      setMatches((matchesData?.matches ?? []) as PerformanceMatch[])
      setStints((stintsData?.stints ?? []) as ClubStint[])
      setReadonly(matchesData?.access === 'readonly')
    }).catch(() => setMatches([]))
  }, [season, router])

  async function handleShare() {
    const competitiveCount = competitive.length
    const headline = focus === 'defensive'
      ? `${summary.cleanSheets} clean sheets in ${competitiveCount} games${summary.minutes > 0 ? ` · ${summary.minutes.toLocaleString('en-GB')} minutes played` : ''}`
      : `${summary.involvements} goal involvements in ${competitiveCount} games (${summary.goals}G ${summary.assists}A)`
    const text = `${seasonLabel(season)} so far on NEXT11VEN: ${headline}${summary.avgRating != null ? ` · avg rating ${summary.avgRating}` : ''}`
    if (navigator.share) {
      try { await navigator.share({ text }) } catch { /* user dismissed */ }
    } else {
      try { await navigator.clipboard.writeText(text); setShared(true); setTimeout(() => setShared(false), 2500) } catch { /* ignore */ }
    }
  }

  const all = matches ?? []
  const competitive = all.filter(m => isCompetitive(m.competition_type))
  const summary: MatchSummary = summariseMatches(competitive)
  const friendlies = summariseMatches(all.filter(m => !isCompetitive(m.competition_type)))
  const category = dominantCategory(profilePosition, all)
  const focus = trackerFocus(category)

  const chronological = [...competitive].sort((a, b) => a.match_date.localeCompare(b.match_date))
  const rated = chronological.filter(m => m.rating != null)
  const best = rated.length ? rated.reduce((a, b) => (Number(b.rating) >= Number(a.rating) ? b : a)) : null
  const spell = bestSpell(rated)

  // Clubs represented this season (from the stints its matches point at)
  const clubNames = [...new Set(
    competitive.map(m => stints.find(s => s.id === m.stint_id)?.club_name).filter((c): c is string => !!c)
  )]

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="px-4 pt-3 pb-3" style={{ borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[
          { label: 'Home', href: '/dashboard/player' },
          { label: 'Game Performance Tracker', href: '/dashboard/performance/tracker' },
          { label: 'Season wrap' },
        ]} />
      </div>

      <div className="px-4 pt-6 max-w-lg mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-black uppercase leading-tight"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Your season so far
          </h1>
          <p className="text-sm mt-1.5" style={{ color: '#8892aa' }}>
            {seasonLabel(season)} — built from every game you&apos;ve logged. Screenshot the card and post it anywhere.
          </p>
        </div>

        {matches === null && (
          <div className="rounded-2xl p-8 text-center" style={surface}>
            <p className="text-sm" style={{ color: '#8892aa' }}>Pulling your season together…</p>
          </div>
        )}

        {matches !== null && competitive.length === 0 && (
          <div className="rounded-2xl p-6 text-center space-y-4" style={surface}>
            <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
              No league or cup games logged for {seasonLabel(season)} yet
              {friendlies.apps > 0 ? ` — your ${friendlies.apps} pre-season game${friendlies.apps === 1 ? ' is' : 's are'} in the bank though` : ''}.
              Your wrap starts building from your first competitive game.
            </p>
            <Link href="/dashboard/performance/tracker/log"
              className="block w-full text-center py-3 rounded-2xl text-sm font-bold uppercase tracking-wider"
              style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
              Log a match
            </Link>
          </div>
        )}

        {/* The wrap is a Premium flex — read-only players get the teaser */}
        {matches !== null && competitive.length > 0 && readonly && (
          <div className="rounded-2xl p-6 text-center space-y-4"
            style={{ border: '1px solid rgba(45,95,196,0.4)', background: 'linear-gradient(160deg, rgba(45,95,196,0.12) 0%, rgba(45,95,196,0.04) 100%)' }}>
            <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
              style={{ backgroundColor: 'rgba(45,95,196,0.15)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                Your season wrap is waiting
              </p>
              <p className="text-sm mt-1.5 leading-relaxed" style={{ color: '#8892aa' }}>
                {summary.apps} game{summary.apps === 1 ? '' : 's'} logged and counting. The shareable season card — best game, best spell, the lot — is a Premium flex.
              </p>
            </div>
            <Link href="/dashboard/player/premium"
              className="block w-full text-center py-3 rounded-2xl text-sm font-bold uppercase tracking-wider"
              style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
              Unlock your wrap
            </Link>
          </div>
        )}

        {matches !== null && competitive.length > 0 && !readonly && (
          <>
            {/* ── The shareable card ── */}
            <div className="rounded-3xl overflow-hidden"
              style={{ border: '1px solid rgba(45,95,196,0.5)', background: 'linear-gradient(165deg, #16204a 0%, #10142c 45%, #0d1020 100%)' }}>

              {/* Card header */}
              <div className="flex items-center justify-between px-5 pt-5">
                <div>
                  <p className="text-xs uppercase tracking-widest font-bold" style={{ color: '#3a6fda' }}>
                    Season wrap · {seasonLabel(season)}
                  </p>
                  <p className="text-2xl font-black uppercase leading-tight mt-1"
                    style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                    {name ?? 'My season'}
                  </p>
                  {clubNames.length > 0 && (
                    <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{clubNames.join(' · ')}</p>
                  )}
                </div>
                <img src="/logo.jpg" alt="NEXT11VEN" className="h-9 w-auto rounded-md flex-shrink-0" />
              </div>

              {/* Hero — position-aware */}
              <div className="px-5 pt-5">
                <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>
                  {focus === 'defensive' ? 'Clean sheets' : 'Goal involvements'}
                </p>
                <p className="font-black leading-none mt-1"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', fontSize: 72 }}>
                  {focus === 'defensive' ? summary.cleanSheets : summary.involvements}
                </p>
              </div>

              {/* Stat row — position-aware */}
              <div className="grid grid-cols-4 gap-2 px-5 pt-4">
                {(focus === 'defensive'
                  ? [
                      { label: 'Apps', value: summary.apps },
                      { label: 'Clean sheets', value: summary.cleanSheets },
                      category === 'goalkeepers'
                        ? { label: 'Pen saves', value: summary.penaltySaves }
                        : { label: 'G + A', value: summary.involvements },
                      { label: 'Avg rating', value: summary.avgRating ?? '—' },
                    ]
                  : [
                      { label: 'Apps', value: summary.apps },
                      { label: 'Goals', value: summary.goals },
                      { label: 'Assists', value: summary.assists },
                      { label: 'Avg rating', value: summary.avgRating ?? '—' },
                    ]
                ).map(({ label, value }) => {
                  const a = statAccent(label)
                  return (
                    <div key={label} className="rounded-xl px-1 py-2.5 text-center"
                      style={{ backgroundColor: 'rgba(10,12,24,0.55)', border: a.border }}>
                      <p className="text-xl font-black leading-none"
                        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: a.fg }}>
                        {value}
                      </p>
                      <p className="mt-1 uppercase tracking-wider font-semibold" style={{ color: '#8892aa', fontSize: 9 }}>{label}</p>
                    </div>
                  )
                })}
              </div>

              {/* Highlights */}
              <div className="px-5 pt-4 pb-5 space-y-2">
                {best && (
                  <div className="flex items-center gap-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <p className="text-sm" style={{ color: '#e8dece' }}>
                      Best game: <span className="font-bold">{Number(best.rating).toFixed(1)} vs {best.opponent}</span>
                      <span style={{ color: '#8892aa' }}> · {fmtShort(best.match_date)}</span>
                    </p>
                  </div>
                )}
                {spell && (
                  <div className="flex items-center gap-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3a6fda" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
                    </svg>
                    <p className="text-sm" style={{ color: '#e8dece' }}>
                      Best spell: <span className="font-bold">{spell.avg} avg</span>
                      <span style={{ color: '#8892aa' }}> · {fmtShort(spell.from)} – {fmtShort(spell.to)}</span>
                    </p>
                  </div>
                )}
                {summary.minutes > 0 && (
                  <div className="flex items-center gap-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3a6fda" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    <p className="text-sm" style={{ color: '#e8dece' }}>
                      <span className="font-bold">{summary.minutes.toLocaleString('en-GB')} minutes</span> on the pitch
                      {summary.avgMinutes != null && <span style={{ color: '#8892aa' }}> · avg {summary.avgMinutes} a game</span>}
                    </p>
                  </div>
                )}
                {friendlies.apps > 0 && (
                  <div className="flex items-center gap-2.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    <p className="text-sm" style={{ color: '#8892aa' }}>
                      Plus {friendlies.apps} pre-season & friendly game{friendlies.apps === 1 ? '' : 's'}
                    </p>
                  </div>
                )}
              </div>

              {/* Card footer */}
              <div className="px-5 py-3 flex items-center justify-between"
                style={{ borderTop: '1px solid rgba(45,95,196,0.25)', backgroundColor: 'rgba(0,0,0,0.25)' }}>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#3a6fda' }}>NEXT11VEN</p>
                <p className="text-xs" style={{ color: '#8892aa' }}>app.next11ven.com</p>
              </div>
            </div>

            {/* Share */}
            <button onClick={handleShare}
              className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider"
              style={{ backgroundColor: 'rgba(45,95,196,0.15)', border: '1px solid rgba(45,95,196,0.4)', color: '#3a6fda' }}>
              {shared ? 'Copied to clipboard' : 'Share your season'}
            </button>
            <p className="text-center text-xs -mt-2" style={{ color: '#8892aa' }}>
              Or screenshot the card — it&apos;s made for it.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function SeasonWrapPage() {
  return (
    <Suspense>
      <SeasonWrapInner />
    </Suspense>
  )
}
