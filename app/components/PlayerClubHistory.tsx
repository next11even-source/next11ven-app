'use client'

// Player profile "History" tab — season, level, club, one row per season,
// free to every viewer. Deliberately no stats (goals/assists/apps): that's
// what the Overview tab and the Coach Pro Dashboard are for. This tab
// answers one question only — "where and when did they actually play" —
// which is exactly what a real coach asked for so he can check a claimed
// step level without leaving the app to Google the player.
//
// Club identity is NOT gated (reversed 20 Aug 2026 — see CLAUDE.md): with
// ~80% of approved players having no season history at all yet, and only a
// handful of coaches on Coach Pro, a paywall here would mostly guard empty
// tabs rather than real value. Full self-reported history ships free,
// labelled as self-reported; verification/stats stay the paid layer
// (Coach Pro Dashboard), for later.

import type { PublicPerformance } from '@/lib/publicStats'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }

function SeasonRow({ seasonLabel, level, clubName }: {
  seasonLabel: string
  level: string | null
  clubName: string | null
}) {
  return (
    <div className="rounded-2xl px-4 py-3" style={surface}>
      <span className="text-base font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{seasonLabel}</span>
      {(level || clubName) && (
        <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
          {level}{level && clubName ? ' · ' : ''}{clubName && <span style={{ color: '#e8dece' }}>{clubName}</span>}
        </p>
      )}
    </div>
  )
}

export default function PlayerClubHistory({ perf }: { perf: PublicPerformance }) {
  const seasons = perf.seasons
  const hasSelfReported = seasons.some(s => s.selfReported)

  if (seasons.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>History</h2>
        <p className="text-sm px-1" style={{ color: '#8892aa' }}>No season history logged yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>History</h2>
        {hasSelfReported && (
          <p className="text-xs mt-1" style={{ color: '#8892aa' }}>
            Some seasons below are self-reported career history the player entered themselves, rather than recorded game-by-game on NEXT11VEN.
          </p>
        )}
      </div>

      <div className="space-y-2">
        {seasons.map(s => (
          <SeasonRow
            key={`${s.seasonStartYear}-${s.source}-${s.clubs.join('_')}`}
            seasonLabel={s.seasonLabel}
            level={s.level}
            clubName={s.clubs.length ? s.clubs.join(' & ') : null}
          />
        ))}
      </div>
    </div>
  )
}
