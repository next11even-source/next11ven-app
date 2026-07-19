'use client'

import { getLevelConfig } from '@/lib/opportunityLevel'
import { getStepToken } from '@/lib/stepTokens'

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

// Club identity crest — monogram ring when a club name is provided, generic
// shield otherwise. Pass `club={null}` to keep the club hidden (e.g. free players).
export function ClubCrest({ club, size = 26 }: { club: string | null; size?: number }) {
  const initials = club
    ? club.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase()
    : null
  const iconSize = Math.round(size * 0.5)
  return (
    <div className="flex-shrink-0 rounded-full flex items-center justify-center"
      style={{ width: size, height: size, backgroundColor: 'rgba(45,95,196,0.12)', border: '1px solid rgba(45,95,196,0.4)' }}>
      {initials ? (
        <span className="font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#4d8ae8', fontSize: size >= 34 ? 13 : 11, letterSpacing: '0.02em' }}>
          {initials}
        </span>
      ) : (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#4d8ae8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )}
    </div>
  )
}
