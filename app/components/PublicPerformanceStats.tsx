'use client'

// Public, coach-facing render of a player's tracked performance. Fed the
// already-reconciled aggregate from lib/publicStats (objective only — no notes,
// tags or self-ratings ever reach here). Position-aware; career rows are clearly
// labelled self-reported (Q4 trust model). No comparative/percentile claims.
//
// Design: lead with big standout stat cards (always populated, so every profile
// opens strong), then current-season detail when there's competitive data, or a
// positive pre-season line when there isn't. The old build hid everything behind
// competitive current-season data — which is empty for anyone mid-pre-season.
//
// Honesty: the totals header never says "Career" unless the data earns it — a
// player with one self-reported season shouldn't look like they've logged a whole
// career. The title scales with how many seasons are on record, shows the actual
// span, and tags the block self-reported when nothing is platform-logged yet.

import { useState } from 'react'
import { RATE_MIN_MINUTES, type PublicPerformance } from '@/lib/publicStats'
import { seasonStartYear, seasonLabel } from '@/lib/performance'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
function fmtRate(n: number | null) {
  return n == null ? '—' : n.toFixed(2)
}

function MiniTile({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="flex-1 rounded-xl p-3 text-center"
      style={accent
        ? { backgroundColor: 'rgba(45,95,196,0.12)', border: '1px solid rgba(45,95,196,0.3)' }
        : { backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
      <p className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: accent ? '#3a6fda' : '#e8dece' }}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: '#8892aa' }}>{label}</p>
    </div>
  )
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1">
      <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>{children}</p>
      {right}
    </div>
  )
}

function FormPills({ results }: { results: ('W' | 'D' | 'L')[] }) {
  const ordered = [...results].reverse()
  return (
    <div className="flex gap-1.5">
      {ordered.map((r, i) => (
        <span key={i} className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black"
          style={r === 'W' ? { backgroundColor: '#2d5fc4', color: '#fff' }
            : r === 'D' ? { backgroundColor: '#1e2235', color: '#8892aa' }
              : { backgroundColor: '#0a0a0a', color: '#8892aa', border: '1px solid #1e2235' }}>
          {r}
        </span>
      ))}
    </div>
  )
}

export default function PublicPerformanceStats({ perf }: { perf: PublicPerformance }) {
  const defensive = perf.focus === 'defensive'
  const t = perf.totals
  const cs = perf.currentSeason
  const cd = perf.currentDetail
  const hasSelfReported = perf.seasons.some(s => s.selfReported)

  const currentYear = seasonStartYear()
  const seasonsCount = perf.seasons.length

  // Adaptive, honest header — never overclaim "Career" from thin data.
  //  1 season  → present it as that season, not a career aggregate.
  //  2–3       → "Track record" (aggregating across years is meaningful).
  //  4+        → "Career totals" is earned.
  // The right-hand detail shows the actual span so a coach reads a window, not a
  // whole footballing life. If every recorded season is self-reported (nothing
  // logged on-platform yet), the block is tagged so big numbers aren't mistaken
  // for verified figures.
  const years = perf.seasons.map(s => s.seasonStartYear)
  const spanStart = years.length ? Math.min(...years) : currentYear
  const spanEnd = years.length ? Math.max(...years) : currentYear
  const allSelfReported = seasonsCount > 0 && perf.seasons.every(s => s.selfReported)
  const trackTitle = seasonsCount >= 4 ? 'Career totals' : seasonsCount >= 2 ? 'Track record' : 'On record'
  const spanDetail = seasonsCount >= 2
    ? `${seasonLabel(spanStart)}–${seasonLabel(spanEnd)}`
    : perf.seasons[0]?.seasonLabel ?? seasonLabel(currentYear)

  // Season picker — a coach flicks the hero between individual seasons instead of
  // reading one blended career aggregate. ALWAYS defaults to the aggregate.
  //
  // It used to auto-select the current season whenever `cs.summary.apps > 0` —
  // the exact same condition that renders the "This season" block below, so one
  // logged game turned the hero into a carbon copy of the block beneath it AND
  // replaced a strong career record with an empty new season. A player two sub
  // appearances into a campaign opened their profile on three zeros. The
  // aggregate always reads strong; picking a season stays a deliberate choice.
  const [selectedIdx, setSelectedIdx] = useState<number>(-1)
  const showPicker = seasonsCount >= 2

  // Season-by-season is the coach's at-a-glance scan + the only per-season
  // Logged/Self-reported provenance view. The dropdown hero now covers the
  // headline, so a long history collapses by default to declutter; short ones
  // (≤3) stay open since there's nothing to hide.
  const [showSeasons, setShowSeasons] = useState(seasonsCount <= 3)
  const active = selectedIdx >= 0 ? perf.seasons[selectedIdx] ?? null : null

  // The view the hero renders — the selected season, or the career aggregate.
  const view = active
    ? {
        goals: active.goals, assists: active.assists, apps: active.apps,
        cleanSheets: active.cleanSheets, minutes: active.minutes, motm: active.motm,
        selfReported: active.selfReported,
        avgMinutes: active.apps > 0 && active.minutes > 0 ? Math.round(active.minutes / active.apps) : null,
        avgMinutesApps: active.apps,
        starts: active.starts, startsApps: active.apps,
      }
    : {
        goals: t.goals, assists: t.assists, apps: t.apps,
        cleanSheets: t.cleanSheets, minutes: t.minutes, motm: t.motm,
        selfReported: allSelfReported, avgMinutes: perf.avgMinutes, avgMinutesApps: perf.avgMinutesApps,
        starts: perf.startsContext?.starts ?? null, startsApps: perf.startsContext?.apps ?? null,
      }
  const viewInvolvements = view.goals + view.assists
  const heroTitle = active ? (active.seasonStartYear === currentYear ? 'New season' : 'Season') : trackTitle

  // Does the hero already show the current season? True when it's been picked
  // explicitly, and also when it's the only season on record (the "aggregate"
  // is then just that one season). Either way the "This season" headline stat
  // below would print the same figures a second time, so it's suppressed.
  const heroShowsCurrent =
    (active != null && active.seasonStartYear === currentYear) ||
    (active == null && seasonsCount === 1 && perf.seasons[0]?.seasonStartYear === currentYear)

  // Too little football this season to state anything as fact. Below the floor
  // every derived figure is noise, so the block drops to a neutral progress
  // read rather than printing zeros a squad player hasn't earned.
  const lowSample = cs != null && cs.summary.minutes < RATE_MIN_MINUTES

  // A derived figure is only honest next to the apps figure it was drawn from.
  // Both of these span logged seasons only, so a player with one logged season
  // behind a long self-reported career would otherwise read "206 APPS" above
  // "15' avg minutes / game — 0/2 starts": a 2-game sample captioning a
  // 206-game career. Shown only when the sample covers what's displayed.
  const showStarts = view.starts != null && view.startsApps === view.apps
  const showAvgMinutes = view.avgMinutes != null && view.avgMinutesApps === view.apps

  // Brand-new player: their only season is this thin one, so the hero has no
  // career to fall back on and would open on "0 Goals · 0 Assists · 0 G+A".
  // Drop it and let the "Season underway" block carry the story — a first
  // appearance is a start, not a failure. Only when the aggregate landed here
  // by default; an explicit season pick keeps the hero so the picker stays
  // reachable (and a deliberate choice is allowed to show what it shows).
  const heroIsBareNewSeason = active == null && seasonsCount === 1 && heroShowsCurrent && lowSample

  // Big hero cards — position-aware. Always populated, so the section always
  // leads with something that reads well whichever season is selected.
  // Minutes are shown as an average, never a total: "1,234 minutes" tells a
  // coach nothing, "67' a game" tells them whether the player finishes games.
  const heroCards = defensive
    ? [
        { label: 'Clean sheets', value: view.cleanSheets, primary: true },
        { label: 'Apps', value: view.apps },
        { label: 'Avg mins', value: showAvgMinutes ? `${view.avgMinutes}'` : '—' },
        { label: 'G + A', value: viewInvolvements },
      ]
    : [
        { label: 'Goals', value: view.goals, primary: true },
        { label: 'Assists', value: view.assists },
        { label: 'G + A', value: viewInvolvements },
        { label: 'Apps', value: view.apps },
      ]

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
        Performance
      </h2>

      {/* ── Career hero — big standout cards. Hidden entirely when there's no
          real (competitive or self-reported) season yet — e.g. a player who's
          only logged pre-season so far gets the reassurance line below
          instead of a hero full of zeros. ─────────────────────────────── */}
      {seasonsCount > 0 && !heroIsBareNewSeason && (
      <div className="space-y-2.5">
        <SectionLabel right={
          <span className="flex items-center gap-2">
            {view.selfReported && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold"
                style={{ backgroundColor: 'rgba(136,146,170,0.12)', color: '#8892aa', border: '1px solid #1e2235' }}>
                Self-reported
              </span>
            )}
            {showPicker ? (
              <div className="relative flex items-center">
                <select
                  value={selectedIdx}
                  onChange={e => setSelectedIdx(Number(e.target.value))}
                  aria-label="Select season"
                  className="appearance-none text-xs font-semibold rounded-lg pl-2.5 pr-7 py-1 cursor-pointer focus:outline-none"
                  style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}>
                  <option value={-1}>All seasons</option>
                  {perf.seasons.map((s, i) => (
                    <option key={`${s.seasonStartYear}-${s.source}-${i}`} value={i}>{s.seasonLabel}</option>
                  ))}
                </select>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                  className="absolute right-2 pointer-events-none"><polyline points="6 9 12 15 18 9" /></svg>
              </div>
            ) : (
              <span className="text-xs" style={{ color: '#8892aa' }}>{spanDetail}</span>
            )}
          </span>
        }>
          {heroTitle}
        </SectionLabel>
        <div className="rounded-2xl flex overflow-hidden" style={surface}>
          {heroCards.map((c, i) => (
            <div key={c.label} className="flex-1 px-2 py-3 text-center"
              style={i > 0 ? { borderLeft: '1px solid #1e2235' } : undefined}>
              <p className="font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 28, color: c.primary ? '#3a6fda' : '#e8dece' }}>
                {c.value}
              </p>
              <p className="text-[10px] uppercase tracking-wider mt-1" style={{ color: '#8892aa' }}>{c.label}</p>
            </div>
          ))}
        </div>
        {/* Defensive players already carry avg mins as a hero card, so only the
            starts context is added here — never print the same figure twice.

            Starts only render when the ratio covers the SAME appearances the
            hero is showing. startsContext spans logged seasons only, so a
            player with one logged season behind a long self-reported career
            would otherwise read "214 APPS" with "0/2 starts" under it — which
            says he has never started a game in his life. */}
        {((!defensive && showAvgMinutes) || showStarts) && (
          <p className="text-xs px-1 flex items-center gap-1.5" style={{ color: '#8892aa' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
            {!defensive && showAvgMinutes && (
              <span><span style={{ color: '#e8dece', fontWeight: 600 }}>{view.avgMinutes}&apos;</span> avg minutes / game</span>
            )}
            {showStarts && (
              <span>{!defensive && showAvgMinutes ? <>&nbsp;— </> : null}<span style={{ color: '#e8dece', fontWeight: 600 }}>{view.starts}/{view.startsApps}</span> starts</span>
            )}
          </p>
        )}
        {view.motm > 0 && (
          <p className="text-xs px-1 flex items-center gap-1.5" style={{ color: '#8892aa' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            {plural(view.motm, 'Man of the match award')}
          </p>
        )}
      </div>
      )}

      {/* Career milestones — always shown regardless of which season is
          selected in the hero. Even when the hero is scoped to a season with
          0 apps, "200+ career appearances" is still worth showing off. */}
      {perf.milestones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {perf.milestones.map(m => (
            <span key={m} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
              style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.28)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
              {m}
            </span>
          ))}
        </div>
      )}

      {/* ── This season — detail when competitive, positive line otherwise ──
          Two things are deliberately withheld early in a campaign:
           • the headline counter, when the hero already shows this same season
             (otherwise the figures print twice — see heroShowsCurrent)
           • every stat that can render 0, below the sample floor. A player a
             couple of sub appearances in gets a neutral "season underway" read
             instead of a 5xl zero they didn't earn. ─────────────────────── */}
      {cs && cs.summary.apps > 0 ? (
        <div className="space-y-2.5">
          <SectionLabel right={<span className="text-xs" style={{ color: '#8892aa' }}>{cs.label}</span>}>This season</SectionLabel>

          {lowSample ? (
            <div className="rounded-2xl px-5 py-4" style={surface}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>
                    Season underway
                  </p>
                  <p className="text-base font-bold mt-1" style={{ color: '#e8dece' }}>
                    {plural(cs.summary.apps, 'appearance')}
                    {cs.summary.avgMinutes != null && (
                      <span style={{ color: '#8892aa', fontWeight: 500 }}> · {cs.summary.avgMinutes}&apos; a game</span>
                    )}
                  </p>
                </div>
                {cd && cd.form.results.length > 0 && <FormPills results={cd.form.results} />}
              </div>
              <p className="text-xs mt-2" style={{ color: '#8892aa' }}>
                Early in the campaign — season figures build as the games do.
              </p>
            </div>
          ) : !heroShowsCurrent ? (
            <div className="rounded-2xl px-5 py-5" style={surface}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>
                    {defensive ? 'Clean sheets' : 'Goal involvements'}
                  </p>
                  <div className="flex items-end gap-3 mt-1">
                    <span className="text-5xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                      {defensive ? cs.summary.cleanSheets : cs.summary.involvements}
                    </span>
                    <p className="text-xs pb-1.5" style={{ color: '#8892aa' }}>
                      {defensive
                        ? `${plural(cs.summary.apps, 'game')}`
                        : `${plural(cs.summary.goals, 'goal')} · ${plural(cs.summary.assists, 'assist')}`}
                    </p>
                  </div>
                </div>
                {cd && cd.form.results.length > 0 && <FormPills results={cd.form.results} />}
              </div>
            </div>
          ) : cd && cd.form.results.length > 0 ? (
            <div className="rounded-2xl px-5 py-3.5 flex items-center justify-between gap-3" style={surface}>
              <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>Recent form</p>
              <FormPills results={cd.form.results} />
            </div>
          ) : null}

          {/* Rates + durability. Per-90s are withheld below the sample floor —
              "0.00 goals / 90" off 30 minutes reads as a verdict, not a sample
              size. Minutes show as an average, never a meaningless total. */}
          {cd && !lowSample && (
            <div className="flex gap-2">
              {!defensive && cd.rates.per90Goals != null && (
                <>
                  <MiniTile label="Goals / 90" value={fmtRate(cd.rates.per90Goals)} accent />
                  <MiniTile label="G+A / 90" value={fmtRate(cd.rates.per90Involvements)} accent />
                </>
              )}
              {defensive && <MiniTile label="Avg mins" value={cs.summary.avgMinutes != null ? `${cs.summary.avgMinutes}'` : '—'} accent />}
              <MiniTile label="Apps" value={cs.summary.apps} />
              <MiniTile label="Starts" value={`${cd.durability.starts}/${cd.durability.apps}`} />
              {!defensive && <MiniTile label="Avg mins" value={cs.summary.avgMinutes != null ? `${cs.summary.avgMinutes}'` : '—'} />}
            </div>
          )}

          {cd && cd.involvementStreak >= 3 && (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.16) 0%, rgba(249,115,22,0.05) 100%)', border: '1px solid rgba(249,115,22,0.45)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
              </svg>
              <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>Scored or assisted in {cd.involvementStreak} straight games</p>
            </div>
          )}
        </div>
      ) : perf.preseasonGamesLogged > 0 ? (
        <p className="text-xs px-1 flex items-center gap-1.5" style={{ color: '#8892aa' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3a6fda" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          <span><span style={{ color: '#e8dece', fontWeight: 600 }}>{seasonLabel(currentYear)} pre-season</span> — {plural(perf.preseasonGamesLogged, 'game')} logged. League games build the record.</span>
        </p>
      ) : null}

      {/* Discipline — versatility ("Played: …") intentionally omitted: it leaks
          the player's current position and their team's formation. */}
      {cd && (cd.discipline.yellowCards > 0 || cd.discipline.redCards > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {cd.discipline.yellowCards > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
              {cd.discipline.yellowCards} yellow{cd.discipline.yellowCards === 1 ? '' : 's'}
            </span>
          )}
          {cd && cd.discipline.redCards > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
              {cd.discipline.redCards} red{cd.discipline.redCards === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      {/* ── Season-by-season history — collapsible ───────────────────────── */}
      {perf.seasons.length > 0 && (
        <div className="space-y-2.5">
          <button onClick={() => setShowSeasons(v => !v)}
            className="w-full flex items-center justify-between px-1 group"
            aria-expanded={showSeasons}>
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>
              Season by season
            </span>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: '#8892aa' }}>
              {showSeasons ? 'Hide' : `Show all ${seasonsCount}`}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showSeasons ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9" /></svg>
            </span>
          </button>
          {showSeasons && (
          <div className="space-y-2">
            {perf.seasons.map(s => {
              const inv = s.goals + s.assists
              return (
                <div key={`${s.seasonStartYear}-${s.source}-${s.clubs.join('_')}`}
                  className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3" style={surface}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{s.seasonLabel}</span>
                      {s.selfReported ? (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(136,146,170,0.12)', color: '#8892aa', border: '1px solid #1e2235' }}>Self-reported</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#3a6fda', border: '1px solid rgba(45,95,196,0.35)' }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          Logged
                        </span>
                      )}
                    </div>
                    {/* Club omitted — season-long club attribution isn't
                        verified and can be misleading. Level is now
                        competitive-only for logged seasons (pre-season/
                        friendlies excluded), so it's a trustworthy signal. */}
                    {s.level && (
                      <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{s.level}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-lg font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{s.apps}</p>
                      <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: '#8892aa' }}>Apps</p>
                    </div>
                    <div className="text-right" style={{ minWidth: 54 }}>
                      <p className="text-lg font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: inv > 0 ? '#3a6fda' : '#8892aa' }}>{s.goals}<span style={{ color: '#8892aa', fontSize: 13 }}>G</span> {s.assists}<span style={{ color: '#8892aa', fontSize: 13 }}>A</span></p>
                      <p className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: '#8892aa' }}>{s.cleanSheets > 0 ? `${s.cleanSheets} CS` : `${inv} G+A`}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          )}
        </div>
      )}

      {hasSelfReported && showSeasons && (
        <p className="text-xs px-1" style={{ color: '#8892aa' }}>
          Self-reported seasons are career history the player entered themselves. Everything marked <span style={{ color: '#3a6fda' }}>Logged</span> is recorded game-by-game on NEXT11VEN.
        </p>
      )}
    </div>
  )
}
