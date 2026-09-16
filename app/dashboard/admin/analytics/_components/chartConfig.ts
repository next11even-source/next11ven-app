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
