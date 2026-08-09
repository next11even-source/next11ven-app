import type { MonthRow } from './types'
import { SectionLabel } from './ui'

const COL_COLORS = {
  signups: '#2d5fc4',
  premium: '#f59e0b',
  churned: '#ef4444',
  messages: '#a78bfa',
  applications: '#60a5fa',
  empty: '#3a4055',
}

export function MonthByMonth({ monthly }: { monthly: MonthRow[] }) {
  return (
    <section>
      <SectionLabel>Month by Month</SectionLabel>
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
        {monthly.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ backgroundColor: '#0a0a0a', borderBottom: '1px solid #1e2235' }}>
                  <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: '#8892aa' }}>Month</th>
                  <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: COL_COLORS.signups }}>Signups</th>
                  <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: COL_COLORS.premium }}>New Sub</th>
                  <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: COL_COLORS.churned }}>Churned</th>
                  <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: COL_COLORS.messages }}>Msgs</th>
                  <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider"
                    style={{ color: COL_COLORS.applications }}>Apps</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row, i) => {
                  const isCurrentMonth = i === monthly.length - 1
                  return (
                    <tr key={row.label}
                      style={{
                        backgroundColor: isCurrentMonth ? '#0d1020' : '#13172a',
                        borderBottom: i < monthly.length - 1 ? '1px solid #1e2235' : 'none',
                      }}>
                      <td className="px-3 py-2.5 font-semibold"
                        style={{ color: isCurrentMonth ? '#e8dece' : '#8892aa' }}>
                        {row.label}
                        {isCurrentMonth && (
                          <span className="ml-1.5 text-xs" style={{ color: COL_COLORS.empty }}>·now</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold"
                        style={{ color: row.new_signups > 0 ? COL_COLORS.signups : COL_COLORS.empty }}>
                        {row.new_signups || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold"
                        style={{ color: row.new_premium > 0 ? COL_COLORS.premium : COL_COLORS.empty }}>
                        {row.new_premium > 0 ? `+${row.new_premium}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold"
                        style={{ color: row.churned > 0 ? COL_COLORS.churned : COL_COLORS.empty }}>
                        {row.churned > 0 ? `-${row.churned}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums"
                        style={{ color: row.messages > 0 ? COL_COLORS.messages : COL_COLORS.empty }}>
                        {row.messages || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums"
                        style={{ color: row.applications > 0 ? COL_COLORS.applications : COL_COLORS.empty }}>
                        {row.applications || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-6 text-center" style={{ backgroundColor: '#13172a' }}>
            <p className="text-xs" style={{ color: '#8892aa' }}>No monthly data yet.</p>
          </div>
        )}
      </div>
    </section>
  )
}
