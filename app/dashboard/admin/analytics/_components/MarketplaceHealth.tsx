import type { MarketplaceHealthStats } from './types'
import { SectionLabel } from './ui'

// Deliberately quieter than the hero row — smaller type, no movement arrows.
// This tier explains WHY the hero numbers moved; it isn't itself the headline.
function RateCard({ label, rate, sub }: { label: string; rate: number | null; sub: string }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#e8dece' }}>{label}</span>
        <span className="text-lg font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
          {rate === null ? '—' : `${rate}%`}
        </span>
      </div>
      {rate !== null && (
        <div className="w-full rounded-full h-1.5 mb-1.5" style={{ backgroundColor: '#1e2235' }}>
          <div className="h-1.5 rounded-full" style={{ width: `${rate}%`, backgroundColor: '#2d5fc4' }} />
        </div>
      )}
      <p className="text-xs" style={{ color: '#8892aa' }}>{sub}</p>
    </div>
  )
}

/**
 * Layer 2 — marketplace health. Explains why the hero row moved: response
 * rate and real-conversation rate are the two funnel checks, outcomes are
 * the actual point of the platform, WAU/DAU stay split player-vs-coach so a
 * healthy player number can't hide a dead coach one.
 */
export function MarketplaceHealthRow({ health }: { health: MarketplaceHealthStats }) {
  const { application_response_rate: appRate, conversation_engagement_rate: convRate, outcomes, wau, dau } = health

  return (
    <section>
      <SectionLabel>Marketplace Health</SectionLabel>
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          <RateCard
            label="Application response"
            rate={appRate.rate_pct}
            sub={`${appRate.responded} of ${appRate.total} answered, last 30d`}
          />
          <RateCard
            label="Real conversations"
            rate={convRate.rate_pct}
            sub={`${convRate.engaged} of ${convRate.total} hit 2+ messages, last 30d`}
          />
        </div>

        <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <span className="text-xs font-semibold uppercase tracking-wider block mb-2.5" style={{ color: '#e8dece' }}>
            Outcomes this month
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xl font-black leading-none block" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                {outcomes.accepted}
              </span>
              <span className="text-xs" style={{ color: '#8892aa' }}>Accepted</span>
            </div>
            <div>
              <span className="text-xl font-black leading-none block" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                {outcomes.signed}
              </span>
              <span className="text-xs" style={{ color: '#8892aa' }}>Signed</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <span className="text-xs font-semibold uppercase tracking-wider block mb-2.5" style={{ color: '#e8dece' }}>
            Weekly / daily active
          </span>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs" style={{ color: '#8892aa' }}>WAU (7d)</span>
              <p className="text-sm font-bold" style={{ color: '#e8dece' }}>
                <span style={{ color: '#2d5fc4' }}>{wau.player}</span> player · <span style={{ color: '#a78bfa' }}>{wau.coach}</span> coach
              </p>
            </div>
            <div>
              <span className="text-xs" style={{ color: '#8892aa' }}>DAU</span>
              <p className="text-sm font-bold" style={{ color: '#e8dece' }}>
                <span style={{ color: '#2d5fc4' }}>{dau.player}</span> player · <span style={{ color: '#a78bfa' }}>{dau.coach}</span> coach
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
