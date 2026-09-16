'use client'

import type { CohortRow } from './types'
import { SectionLabel } from './ui'

// Colour-scale a retention % onto brand blue (#2d5fc4 = rgb(45,95,196)).
// 0% → near-invisible (opacity 0.06), 100% → solid (opacity 0.82).
function cellBg(pct: number | undefined): string {
  if (pct === undefined) return '#1e2235'  // no snapshot for this week yet
  const opacity = 0.06 + (pct / 100) * 0.76
  return `rgba(45,95,196,${opacity.toFixed(2)})`
}

function cellText(pct: number | undefined): string {
  if (pct === undefined) return '#3a4055'
  return pct >= 40 ? '#e8dece' : '#8892aa'
}

function formatWeek(isoDate: string): string {
  // "2026-04-07" → "7 Apr"
  const d = new Date(`${isoDate}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export function CohortRetentionGrid({ data }: { data: CohortRow[] }) {
  if (!data.length) {
    return (
      <section>
        <SectionLabel>Signup Cohort Retention</SectionLabel>
        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-xs" style={{ color: '#8892aa' }}>
            Retention data accrues from the first weekly snapshot run.
            No backfill is possible — data accumulates from this week forward.
          </p>
        </div>
      </section>
    )
  }

  // Determine the max week offset that has any data across all cohorts
  const maxOffset = data.reduce((max, row) => {
    const offsets = Object.keys(row.retention).map(Number)
    return offsets.length ? Math.max(max, ...offsets) : max
  }, 0)

  const offsets = Array.from({ length: maxOffset + 1 }, (_, i) => i)

  return (
    <section>
      <SectionLabel>Signup Cohort Retention</SectionLabel>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ backgroundColor: '#0a0a0a', borderBottom: '1px solid #1e2235' }}>
                <th className="text-left px-3 py-2 font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: '#8892aa' }}>
                  Cohort
                </th>
                <th className="text-right px-2 py-2 font-semibold uppercase tracking-wider"
                  style={{ color: '#8892aa' }}>
                  n
                </th>
                {offsets.map(w => (
                  <th key={w} className="text-center px-2 py-2 font-semibold uppercase tracking-wider"
                    style={{ color: '#8892aa' }}>
                    W{w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={row.signup_week}
                  style={{
                    borderBottom: i < data.length - 1 ? '1px solid #1e2235' : 'none',
                    backgroundColor: '#13172a',
                  }}>
                  <td className="px-3 py-2 font-semibold whitespace-nowrap"
                    style={{ color: '#8892aa' }}>
                    {formatWeek(row.signup_week)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums"
                    style={{ color: '#8892aa' }}>
                    {row.cohort_size}
                  </td>
                  {offsets.map(w => {
                    const pct = row.retention[String(w)]
                    // Weeks that haven't elapsed yet are genuinely no-data
                    // (the cohort hasn't had that week pass, not a missed snapshot)
                    return (
                      <td key={w} className="px-2 py-1.5 text-center tabular-nums"
                        style={{ minWidth: 36 }}>
                        <span
                          className="inline-flex items-center justify-center rounded text-xs font-bold"
                          style={{
                            width: 32,
                            height: 22,
                            backgroundColor: cellBg(pct),
                            color: cellText(pct),
                          }}>
                          {pct !== undefined ? `${pct}%` : ''}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-3 py-2 text-xs" style={{ color: '#3a4055', borderTop: '1px solid #1e2235' }}>
          Login-based retention. Admin accounts excluded. Data accrues from first snapshot — no backfill possible.
        </p>
      </div>
    </section>
  )
}
