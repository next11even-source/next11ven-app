// Shared low-level card/chart primitives for the admin analytics page.

export type DayPoint = { label: string; value: number }

export function LineChart({ data, color = '#2d5fc4' }: { data: DayPoint[]; color?: string }) {
  if (!data.length) return null
  const W = 300
  const H = 100
  const padX = 8
  const padY = 12
  const chartW = W - padX * 2
  const chartH = H - padY * 2 - 14

  const max = Math.max(...data.map(d => d.value), 1)

  const pts = data.map((d, i) => ({
    x: data.length === 1 ? padX + chartW / 2 : padX + (i / (data.length - 1)) * chartW,
    y: padY + (1 - d.value / max) * chartH,
    ...d,
  }))

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const areaD = `${pathD} L${pts[pts.length - 1].x},${padY + chartH} L${pts[0].x},${padY + chartH}Z`

  const labelIdxs = data.length <= 3
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 2), data.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {[0, 0.5, 1].map(f => (
        <line key={f} x1={padX} y1={padY + f * chartH} x2={W - padX} y2={padY + f * chartH}
          stroke="#1e2235" strokeWidth="1" />
      ))}
      <path d={areaD} fill={color} opacity="0.1" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} />
      ))}
      {labelIdxs.map(i => (
        <text key={i} x={pts[i].x} y={H - 2} textAnchor="middle" fontSize="8" fill="#8892aa">
          {pts[i].label}
        </text>
      ))}
      <text x={padX} y={padY - 2} fontSize="8" fill="#8892aa">{max}</text>
    </svg>
  )
}

// Small inline sparkline for hero cards — no axis labels, just the shape.
export function Sparkline({ data, color = '#2d5fc4' }: { data: DayPoint[]; color?: string }) {
  if (!data.length) return null
  const W = 120
  const H = 32
  const max = Math.max(...data.map(d => d.value), 1)
  const min = Math.min(...data.map(d => d.value), 0)
  const range = max - min || 1

  const pts = data.map((d, i) => ({
    x: data.length === 1 ? W / 2 : (i / (data.length - 1)) * W,
    y: H - ((d.value - min) / range) * H,
  }))
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H }}>
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StatCard({ label, value, sub, color = '#e8dece' }: {
  label: string; value: number | string; sub?: string; color?: string
}) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <span className="text-2xl font-black leading-none"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color }}>
        {value.toLocaleString()}
      </span>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#e8dece', fontSize: 10 }}>{label}</span>
      {sub && <span className="text-xs" style={{ color: '#8892aa' }}>{sub}</span>}
    </div>
  )
}

export function ChartCard({ title, data, color, total, valuePrefix = '' }: {
  title: string; data: DayPoint[]; color: string; total: number; valuePrefix?: string
}) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{title}</p>
        <span className="text-sm font-black" style={{ color, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {valuePrefix}{total.toLocaleString()}
        </span>
      </div>
      {total === 0
        ? <div className="flex items-center justify-center h-24 rounded-lg" style={{ backgroundColor: '#0a0a0a' }}>
            <p className="text-xs" style={{ color: '#8892aa' }}>No data for this period</p>
          </div>
        : <LineChart data={data} color={color} />}
    </div>
  )
}

export function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null
  const isCoach = role === 'coach'
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0"
      style={{
        backgroundColor: isCoach ? 'rgba(168,139,250,0.15)' : 'rgba(45,95,196,0.15)',
        color: isCoach ? '#a78bfa' : '#2d5fc4',
      }}>
      {isCoach ? 'Coach' : 'Player'}
    </span>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs uppercase tracking-wider mb-2" style={{ color: '#8892aa' }}>{children}</p>
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      {children}
    </div>
  )
}

export function LoadingCard() {
  return (
    <div className="rounded-xl p-6 flex items-center justify-center"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="w-5 h-5 rounded-full border-2 animate-spin"
        style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
    </div>
  )
}
