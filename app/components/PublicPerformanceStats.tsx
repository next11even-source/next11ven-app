'use client'

// Public, coach-facing render of a player's tracked performance. Fed the
// already-reconciled aggregate from lib/publicStats (objective only — no notes,
// tags or self-ratings ever reach here). Position-aware; career rows are clearly
// labelled self-reported (Q4 trust model). Comparative/percentile claims are
// deliberately absent — self-reported data never gets ranked.

import type { PublicPerformance } from '@/lib/publicStats'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
function fmtRate(n: number | null) {
  return n == null ? '—' : n.toFixed(2)
}

function HeadlineStat({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div className="rounded-2xl px-5 py-5" style={surface}>
      <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>{label}</p>
      <div className="flex items-end gap-3 mt-1">
        <span className="text-5xl font-black leading-none" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          {value}
        </span>
        <p className="text-xs pb-1.5" style={{ color: '#8892aa' }}>{sub}</p>
      </div>
    </div>
  )
}

function Tile({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs uppercase tracking-wider font-semibold px-1" style={{ color: '#8892aa' }}>{children}</p>
}

function FormPills({ results }: { results: ('W' | 'D' | 'L')[] }) {
  // Oldest → newest reads more naturally left-to-right; input is newest-first.
  const ordered = [...results].reverse()
  return (
    <div className="flex gap-1.5">
      {ordered.map((r, i) => (
        <span key={i} className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black"
          style={r === 'W'
            ? { backgroundColor: '#2d5fc4', color: '#fff' }
            : r === 'D'
              ? { backgroundColor: '#1e2235', color: '#8892aa' }
              : { backgroundColor: '#0a0a0a', color: '#8892aa', border: '1px solid #1e2235' }}>
          {r}
        </span>
      ))}
    </div>
  )
}

export default function PublicPerformanceStats({ perf }: { perf: PublicPerformance }) {
  const cs = perf.currentSeason
  const cd = perf.currentDetail
  const defensive = perf.focus === 'defensive'
  const hasSelfReported = perf.seasons.some(s => s.selfReported)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold uppercase flex items-center gap-2" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Performance
          {perf.level && (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold"
              style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#3a6fda', border: '1px solid rgba(45,95,196,0.35)' }}>
              {perf.level}
            </span>
          )}
        </h2>
        {cs && <span className="text-xs" style={{ color: '#8892aa' }}>{cs.label}</span>}
      </div>

      {/* Current-season headline — position-aware, competitive only */}
      {cs && cs.summary.apps > 0 && (
        <>
          <HeadlineStat
            label={defensive ? 'Clean sheets' : 'Goal involvements'}
            value={defensive ? cs.summary.cleanSheets : cs.summary.involvements}
            sub={defensive
              ? `${plural(cs.summary.apps, 'game')}${cs.summary.avgMinutes != null ? ` · ${cs.summary.avgMinutes} mins a game` : ''}`
              : `${plural(cs.summary.goals, 'goal')} · ${plural(cs.summary.assists, 'assist')}`}
          />

          <div className="flex gap-2">
            <Tile label="Apps" value={cs.summary.apps} />
            {defensive
              ? <Tile label="Clean sheets" value={cs.summary.cleanSheets} />
              : <Tile label="Goals" value={cs.summary.goals} />}
            {defensive
              ? <Tile label="G + A" value={cs.summary.involvements} />
              : <Tile label="Assists" value={cs.summary.assists} />}
            <Tile label="Mins" value={cs.summary.minutes.toLocaleString('en-GB')} />
          </div>

          {/* Per-90 / per-game — makes a short season comparable to a long one */}
          {cd && cs.summary.minutes > 0 && (
            <div className="flex gap-2">
              {defensive ? (
                <>
                  <Tile label="Mins / game" value={cs.summary.avgMinutes ?? '—'} accent />
                  <Tile label="Start rate" value={`${cs.summary.starts}/${cs.summary.apps}`} />
                  <Tile label="G+A / 90" value={fmtRate(cd.rates.per90Involvements)} />
                </>
              ) : (
                <>
                  <Tile label="Goals / 90" value={fmtRate(cd.rates.per90Goals)} accent />
                  <Tile label="G+A / 90" value={fmtRate(cd.rates.per90Involvements)} accent />
                  <Tile label="G+A / game" value={fmtRate(cd.rates.perGameInvolvements)} />
                </>
              )}
            </div>
          )}

          {/* Form — last 5 results + recent involvements (never the private rating) */}
          {cd && cd.form.results.length > 0 && (
            <div className="rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3" style={surface}>
              <div>
                <SectionLabel>Recent form</SectionLabel>
                <p className="text-xs mt-1" style={{ color: '#8892aa' }}>
                  {plural(cd.form.involvementsLast5, 'goal involvement')} in the last {Math.min(5, cs.summary.apps)}
                </p>
              </div>
              <FormPills results={cd.form.results} />
            </div>
          )}

          {/* Durability — concrete availability signals, no dishonest % */}
          {cd && (
            <div>
              <SectionLabel>Durability</SectionLabel>
              <div className="flex gap-2 mt-2">
                <Tile label="Starts" value={`${cd.durability.starts}/${cd.durability.apps}`} />
                <Tile label="Last 6 wks" value={cd.durability.gamesLast6Weeks} />
                {cd.durability.startStreak > 1
                  ? <Tile label="Start streak" value={cd.durability.startStreak} accent />
                  : <Tile label="Avg mins" value={cd.durability.avgMinutes ?? '—'} />}
              </div>
            </div>
          )}

          {/* Scoring streak — a live positive signal */}
          {cd && cd.involvementStreak >= 3 && (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'linear-gradient(135deg, rgba(249,115,22,0.16) 0%, rgba(249,115,22,0.05) 100%)', border: '1px solid rgba(249,115,22,0.45)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
              </svg>
              <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>
                Scored or assisted in {cd.involvementStreak} straight games
              </p>
            </div>
          )}

          {cs.summary.motmCount > 0 && (
            <p className="text-xs px-1" style={{ color: '#8892aa' }}>
              {plural(cs.summary.motmCount, 'Man of the match award')} this season
            </p>
          )}

          {/* Versatility + discipline row */}
          {(perf.versatility.length > 1 || (cd && (cd.discipline.yellowCards > 0 || cd.discipline.redCards > 0))) && (
            <div className="flex flex-wrap items-center gap-2">
              {perf.versatility.length > 1 && perf.versatility.map(p => (
                <span key={p} className="text-xs font-bold px-2.5 py-1 rounded-lg"
                  style={{ backgroundColor: '#0a0a0a', color: '#e8dece', border: '1px solid #1e2235' }}>
                  {p}
                </span>
              ))}
              {cd && cd.discipline.yellowCards > 0 && (
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
        </>
      )}

      {/* Career milestones */}
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

      {/* Season-by-season history — log seasons + non-overlapping career seasons */}
      {perf.seasons.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={surface}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e2235' }}>
            <h3 className="text-sm font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Season history
            </h3>
          </div>
          <div className="px-4">
            {perf.seasons.map(s => (
              <div key={`${s.seasonStartYear}-${s.source}-${s.clubs.join('_')}`}
                className="flex items-center justify-between py-3 gap-3" style={{ borderBottom: '1px solid #1e2235' }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold" style={{ color: '#e8dece' }}>{s.seasonLabel}</span>
                    {s.selfReported ? (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(136,146,170,0.12)', color: '#8892aa', border: '1px solid #1e2235' }}>
                        Self-reported
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#3a6fda', border: '1px solid rgba(45,95,196,0.35)' }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Logged here
                      </span>
                    )}
                  </div>
                  <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>
                    {[s.clubs.join(', ') || null, s.level].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                    {s.apps} {s.apps === 1 ? 'app' : 'apps'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                    {s.goals}G · {s.assists}A{s.cleanSheets > 0 ? ` · ${s.cleanSheets}CS` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasSelfReported && (
        <p className="text-xs px-1" style={{ color: '#8892aa' }}>
          Self-reported seasons are career history the player entered themselves. Everything else is logged game-by-game on NEXT11VEN.
        </p>
      )}
    </div>
  )
}
