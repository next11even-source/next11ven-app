'use client'

// Public, coach-facing render of a player's tracked performance. Fed the
// already-reconciled aggregate from lib/publicStats (objective only — no notes,
// tags or self-ratings ever reach here). Position-aware headline; career rows
// are clearly labelled self-reported (Q4 trust model).

import type { PublicPerformance } from '@/lib/publicStats'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
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

function MiniTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
      <p className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{value}</p>
      <p className="text-xs uppercase tracking-wider mt-0.5" style={{ color: '#8892aa' }}>{label}</p>
    </div>
  )
}

export default function PublicPerformanceStats({ perf }: { perf: PublicPerformance }) {
  const cs = perf.currentSeason
  const defensive = perf.focus === 'defensive'
  const hasSelfReported = perf.seasons.some(s => s.selfReported)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Performance
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
            <MiniTile label="Apps" value={cs.summary.apps} />
            {defensive ? (
              <MiniTile label="Clean sheets" value={cs.summary.cleanSheets} />
            ) : (
              <MiniTile label="Goals" value={cs.summary.goals} />
            )}
            {defensive ? (
              <MiniTile label="G + A" value={cs.summary.involvements} />
            ) : (
              <MiniTile label="Assists" value={cs.summary.assists} />
            )}
            <MiniTile label="Mins" value={cs.summary.minutes.toLocaleString('en-GB')} />
          </div>
          {cs.summary.motmCount > 0 && (
            <p className="text-xs px-1" style={{ color: '#8892aa' }}>
              {plural(cs.summary.motmCount, 'Man of the match award')} this season
            </p>
          )}
        </>
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
