import type { TrackerStats } from './types'
import { SectionLabel } from './ui'

const COL_COLORS = {
  matches: '#38bdf8',
  loggers: '#60a5fa',
  history: '#a78bfa',
  contributors: '#c4b5fd',
  empty: '#3a4055',
}

// Same table shape as Month by Month — one row per period, metric columns
// on the right — because that format is the easy-to-scan, easy-to-compare
// read, not the line charts these replaced.
export function TrackerAdoptionTrends({ trackerStats }: { trackerStats: TrackerStats | null }) {
  const weekly = trackerStats?.weekly_adoption ?? []

  return (
    <section>
      <SectionLabel>Weekly Adoption</SectionLabel>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
        {weekly.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ backgroundColor: '#0a0a0a', borderBottom: '1px solid #1e2235' }}>
                  <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: '#8892aa' }}>Week</th>
                  <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: COL_COLORS.matches }}>Matches</th>
                  <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: COL_COLORS.loggers }}>Loggers</th>
                  <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: COL_COLORS.history }}>History</th>
                  <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: COL_COLORS.contributors }}>Contributors</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((row, i) => {
                  const isCurrentWeek = i === weekly.length - 1
                  return (
                    <tr key={row.label}
                      style={{
                        backgroundColor: isCurrentWeek ? '#0d1020' : '#13172a',
                        borderBottom: i < weekly.length - 1 ? '1px solid #1e2235' : 'none',
                      }}>
                      <td className="px-3 py-2.5 font-semibold"
                        style={{ color: isCurrentWeek ? '#e8dece' : '#8892aa' }}>
                        {row.label}
                        {isCurrentWeek && (
                          <span className="ml-1.5 text-xs" style={{ color: COL_COLORS.empty }}>·now</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold"
                        style={{ color: row.matches > 0 ? COL_COLORS.matches : COL_COLORS.empty }}>
                        {row.matches || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums"
                        style={{ color: row.loggers > 0 ? COL_COLORS.loggers : COL_COLORS.empty }}>
                        {row.loggers || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold"
                        style={{ color: row.history_rows > 0 ? COL_COLORS.history : COL_COLORS.empty }}>
                        {row.history_rows || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums"
                        style={{ color: row.contributors > 0 ? COL_COLORS.contributors : COL_COLORS.empty }}>
                        {row.contributors || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-6 text-center" style={{ backgroundColor: '#13172a' }}>
            <p className="text-xs" style={{ color: '#8892aa' }}>No adoption data yet.</p>
          </div>
        )}
      </div>
      <p className="text-xs px-1 pt-2" style={{ color: '#8892aa' }}>
        History excludes the one-time legacy import (127 rows, 13 Jul) — self-reported adds only.
      </p>
    </section>
  )
}
