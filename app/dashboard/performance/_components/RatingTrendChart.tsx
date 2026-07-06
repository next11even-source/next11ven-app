'use client'

// Rating trend across the season — clean SVG line, no chart dependency.
// Season-average dashed reference line; the current/selected match gets the
// large highlighted dot.

type Point = { id: string; label: string; rating: number }

type Props = {
  /** Rated matches in chronological order. */
  points: Point[]
  highlightId?: string
  seasonAvg?: number | null
}

const W = 640
const H = 200
const PAD = { top: 18, right: 16, bottom: 26, left: 30 }

export default function RatingTrendChart({ points, highlightId, seasonAvg }: Props) {
  if (points.length < 2) return null

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const ratings = points.map(p => p.rating)
  const yMin = Math.max(1, Math.floor(Math.min(...ratings, seasonAvg ?? 10) - 0.5))
  const yMax = Math.min(10, Math.ceil(Math.max(...ratings, seasonAvg ?? 1) + 0.5))

  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (r: number) => PAD.top + innerH - ((r - yMin) / (yMax - yMin)) * innerH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ')

  const gridLines: number[] = []
  for (let r = yMin; r <= yMax; r++) gridLines.push(r)

  const highlightIdx = highlightId ? points.findIndex(p => p.id === highlightId) : -1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Rating trend across the season">
      {/* Grid + y labels */}
      {gridLines.map(r => (
        <g key={r}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(r)} y2={y(r)} stroke="#1e2235" strokeWidth={1} />
          <text x={PAD.left - 8} y={y(r) + 3.5} textAnchor="end" fontSize={10} fill="#8892aa">{r}</text>
        </g>
      ))}

      {/* Season average reference */}
      {seasonAvg != null && seasonAvg >= yMin && seasonAvg <= yMax && (
        <g>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(seasonAvg)} y2={y(seasonAvg)}
            stroke="#8892aa" strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
          <text x={W - PAD.right} y={y(seasonAvg) - 5} textAnchor="end" fontSize={9.5} fill="#8892aa">
            season avg {seasonAvg}
          </text>
        </g>
      )}

      {/* Line */}
      <path d={path} fill="none" stroke="#2d5fc4" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots */}
      {points.map((p, i) => {
        const highlighted = i === highlightIdx
        return (
          <g key={p.id}>
            {highlighted && <circle cx={x(i)} cy={y(p.rating)} r={9} fill="rgba(45,95,196,0.25)" />}
            <circle cx={x(i)} cy={y(p.rating)} r={highlighted ? 5 : 3}
              fill={highlighted ? '#3a6fda' : '#13172a'} stroke="#2d5fc4" strokeWidth={2} />
            {highlighted && (
              <text x={x(i)} y={y(p.rating) - 13} textAnchor="middle" fontSize={11} fontWeight={700} fill="#e8dece">
                {p.rating}
              </text>
            )}
          </g>
        )
      })}

      {/* First/last x labels */}
      <text x={PAD.left} y={H - 8} textAnchor="start" fontSize={10} fill="#8892aa">{points[0].label}</text>
      <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize={10} fill="#8892aa">{points[points.length - 1].label}</text>
    </svg>
  )
}
