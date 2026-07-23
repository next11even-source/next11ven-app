'use client'

import { getLevelConfig } from '@/lib/opportunityLevel'
import { getStepToken } from '@/lib/stepTokens'
import type { PrimarySignal } from '@/lib/opportunitySignal'

// Small status-signal pill (urgent / be-first / few-applied). Shared so the
// Open Roles feed and the homepage preview render signals identically.
export function SignalChip({ signal }: { signal: PrimarySignal }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${signal.pulse ? 'animate-pulse motion-reduce:animate-none' : ''}`}
      style={{ color: signal.color, backgroundColor: signal.bg }}>
      {signal.label}
    </span>
  )
}

// Match-score chip — the primary premium hook. Premium: the real NN% (green
// when strong, blue otherwise). Free: a locked chip that triggers the match
// paywall via onLocked. matchPercent is gated server-side (null for free), so
// a free client never receives the number to render.
export function MatchChip({ matchPercent, isPremium, onLocked }: { matchPercent: number | null; isPremium: boolean; onLocked?: () => void }) {
  if (isPremium && matchPercent !== null) {
    const strong = matchPercent >= 85
    const color = strong ? '#22c55e' : '#4d8ae8'
    return (
      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold flex-shrink-0"
        style={{ color, backgroundColor: `${color}1f` }}>
        {matchPercent}% match
      </span>
    )
  }
  if (isPremium) return null // premium but no signal to score against
  return (
    <button type="button" onClick={e => { e.stopPropagation(); e.preventDefault(); onLocked?.() }}
      aria-label="Match score locked — upgrade to Premium to see how well this role fits you"
      className="text-xs px-2.5 py-0.5 rounded-full font-bold flex-shrink-0 inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d8ae8]"
      style={{ color: '#8892aa', backgroundColor: 'rgba(136,146,170,0.12)' }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Match
    </button>
  )
}

// Shared opportunity-card primitives, used by the unified opportunities page
// and the player/coach homepage previews so the Step badge + club crest look
// identical everywhere.

// Colour-coded level block. `size` lets compact homepage rows shrink the badge
// while keeping the proportions of the full browse cards.
export function LevelBadge({ level, size = 52 }: { level: string | null; size?: number }) {
  const cfg = getLevelConfig(level)
  const big = size >= 50
  return (
    <div className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl"
      style={{ width: size, height: size, backgroundColor: cfg.bg, border: `1px solid ${cfg.color}40` }}>
      <span className="font-black uppercase leading-none"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: cfg.color, fontSize: cfg.line1.length > 4 ? (big ? 9 : 8) : (big ? 11 : 10), letterSpacing: '0.04em' }}>
        {cfg.line1}
      </span>
      {cfg.line2 && (
        <span className="font-black leading-none mt-0.5"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: cfg.color, fontSize: cfg.line2.length <= 2 ? (big ? 20 : 16) : 10 }}>
          {cfg.line2}
        </span>
      )}
    </div>
  )
}

// Colour-coded STEP badge — the opportunity card's lead visual, replacing the
// club-initials crest. Rounded square, tinted background + border in the step
// colour (lib/stepTokens.ts), small "STEP" label over a bold number.
//
// `inRange` = is this role within ±1 step of the viewing player? When false the
// badge is desaturated to slate, so the colour system doubles as a "this one's
// for you" signal. Off-ladder / OTHER levels (step 0) render their own single
// "OTHER" label.
export function StepBadge({ level, inRange = true, size = 44 }: { level: string | null; inRange?: boolean; size?: number }) {
  const token = getStepToken(level)
  const isOther = token.step === 0
  // Desaturate out-of-range roles: keep the number, drop the colour.
  const color = inRange && !isOther ? token.color : '#64748b'
  const big = size >= 44
  return (
    <div className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl"
      style={{ width: size, height: size, backgroundColor: `${color}22`, border: `1px solid ${color}55` }}>
      <span className="font-black uppercase leading-none"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color, fontSize: big ? 9 : 8, letterSpacing: '0.06em' }}>
        {isOther ? 'OTHER' : 'STEP'}
      </span>
      {!isOther && (
        <span className="font-black leading-none mt-0.5"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color, fontSize: big ? 20 : 16 }}>
          {token.step}
        </span>
      )}
    </div>
  )
}
