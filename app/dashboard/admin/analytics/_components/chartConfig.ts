// Platform launched April 2026. Pre-launch months exist in monthly_table as
// legacy/Glide migration rows with structural zeros for apps/messages/opps.
// Charts filter to this start; the raw MonthByMonth table shows full history
// since zeros are obviously zeros in a table.
export const CHART_START = new Date('2026-04-01')

export function filterFromLaunch<T extends { label: string }>(rows: T[]): T[] {
  return rows.filter(m => {
    const [mon, yr] = m.label.split(' ')
    return new Date(`${mon} 20${yr}`) >= CHART_START
  })
}

// ── Monthly window selector ───────────────────────────────────────────────────
// Used by charts that receive monthly_table data. 'all' = from launch (Apr 2026).
export type MonthWindow = '3m' | '6m' | '12m' | 'all'

export const MONTH_WINDOWS: { value: MonthWindow; label: string }[] = [
  { value: '3m',  label: 'Last 3 months' },
  { value: '6m',  label: 'Last 6 months' },
  { value: '12m', label: 'Last year' },
  { value: 'all', label: 'Since launch' },
]

/** Slices to the last N months after filterFromLaunch has already been applied. */
export function sliceWindow<T extends { label: string }>(rows: T[], w: MonthWindow): T[] {
  if (w === 'all') return rows
  const n = w === '3m' ? 3 : w === '6m' ? 6 : 12
  return rows.slice(-n)
}

// Shared recharts style tokens — keeps every chart visually consistent
// without duplicating inline style objects.
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#13172a',
  border: '1px solid #1e2235',
  borderRadius: 8,
  fontSize: 12,
  color: '#e8dece',
} as const

export const CHART_LABEL_STYLE = { color: '#8892aa', marginBottom: 4 } as const

export const CHART_GRID_COLOR = '#1e2235'
export const CHART_TICK_STYLE = { fill: '#8892aa', fontSize: 10 } as const
