import { COMPARISON_ROWS } from '@/lib/premiumContent'

type Props = {
  /** `full` = all 6 rows (premium page). `compact` = first 3 rows (modal). */
  variant?: 'full' | 'compact'
  className?: string
}

function Cross() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ab8ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function PremiumComparison({ variant = 'full', className }: Props) {
  const rows = variant === 'compact' ? COMPARISON_ROWS.slice(0, 3) : COMPARISON_ROWS

  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${className ?? ''}`}
      style={{ border: '1px solid #1e2235' }}
    >
      {/* Continuous column fills behind everything — dull Free side, vibrant
          Premium side. Solid blocks (not per-cell tints) so neither column
          breaks into bands across the label rows. */}
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: '1fr 1fr' }} aria-hidden>
        <div style={{ backgroundColor: '#0e111c', borderRight: '1px solid #1e2235' }} />
        <div style={{ backgroundColor: '#1a2c5e' }} />
      </div>

      {/* Content layer — transparent cells let the column fills show through */}
      <div className="relative">
        {/* Column headers */}
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="px-4 py-2.5 text-center" style={{ borderBottom: '1px solid #1e2235' }}>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>Free</span>
          </div>
          <div className="px-4 py-2.5 text-center" style={{ borderBottom: '1px solid #2a3d6e' }}>
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#7aa2ff' }}>Premium</span>
          </div>
        </div>

        {rows.map((row, i) => (
          <div key={row.label}>
            {/* Row label spans both columns */}
            <p
              className="px-4 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide"
              style={{ color: '#8892aa', borderTop: i === 0 ? 'none' : '1px solid #1e2235' }}
            >
              {row.label}
            </p>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {/* Free — dimmed */}
              <div className="flex items-start gap-2 px-4 pb-3" style={{ opacity: 0.6 }}>
                <Cross />
                <span className="text-xs leading-snug" style={{ color: '#8892aa' }}>{row.free}</span>
              </div>
              {/* Premium — sits on the vibrant fill */}
              <div className="flex items-start gap-2 px-4 pb-3">
                <Tick />
                <span className="text-xs leading-snug font-medium" style={{ color: '#f1ece2' }}>{row.premium}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
