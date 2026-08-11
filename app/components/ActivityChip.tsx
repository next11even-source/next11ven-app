'use client'

import { getActivityTier, getActivityLabel, type ActivityTier } from '@/lib/activityRecency'

/**
 * Recency chip for `profiles.last_active`. Renders nothing when there's no
 * recent activity — see the design rule in lib/activityRecency.ts.
 *
 * mode='granular' — coach surfaces. Today / this week / this month.
 * mode='binary'   — player surfaces. A plain "Active", or nothing.
 *
 * Blue only. Green is reserved for availability signals (Actively Looking).
 */

const BLUE = '#60a5fa'
const MUTED = '#8892aa'

// "This month" is a weaker signal, so it reads weaker — muted, no pulse.
const TONE: Record<ActivityTier, string> = {
  today: BLUE,
  week: BLUE,
  month: MUTED,
}

export default function ActivityChip({
  lastActive,
  mode = 'granular',
  size = 'md',
  className = '',
}: {
  lastActive: string | null | undefined
  mode?: 'granular' | 'binary'
  size?: 'sm' | 'md'
  className?: string
}) {
  const tier = getActivityTier(lastActive)
  if (!tier) return null
  if (mode === 'binary' && tier === 'month') return null

  const label = mode === 'binary' ? 'Active' : getActivityLabel(tier)
  const colour = mode === 'binary' ? BLUE : TONE[tier]
  const dot = size === 'sm' ? 'w-1 h-1' : 'w-1.5 h-1.5'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full whitespace-nowrap ${size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'} ${className}`}
      style={{ backgroundColor: `${colour}26`, color: colour }}
    >
      <span
        className={`${dot} rounded-full ${tier === 'today' ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: colour }}
      />
      {label}
    </span>
  )
}
