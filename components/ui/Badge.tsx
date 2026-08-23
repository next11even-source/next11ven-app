import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import Icon from './Icon'
import { COLORS, RADIUS_SM } from './tokens'

type Tone = 'neutral' | 'accent' | 'pro' | 'urgent' | 'available' | 'spotlight'

const TONE_COLORS: Record<Tone, { color: string; bg: string }> = {
  neutral: { color: COLORS.textMuted, bg: 'rgba(136,146,170,0.12)' },
  // Text-on-tint uses accentOnDark, not accent — see tokens.ts. Step chips use this tone.
  accent: { color: COLORS.accentOnDark, bg: COLORS.accentBg },
  pro: { color: COLORS.pro, bg: COLORS.proBg },
  urgent: { color: COLORS.urgent, bg: COLORS.urgentBg },
  // The documented green carve-out (CLAUDE.md Brand & Style) — availability
  // signals, positive confirmations, positive analytics movement only. Never
  // reach for this tone for anything else.
  available: { color: COLORS.available, bg: COLORS.availableBg },
  // One-off promotional "New Feature" marker only — see tokens.ts for why this
  // isn't just `urgent` reused. Reach for this tone rarely.
  spotlight: { color: COLORS.spotlight, bg: COLORS.spotlightBg },
}

type Props = {
  children: ReactNode
  tone?: Tone
  icon?: LucideIcon
  className?: string
}

/**
 * The one pill/tag/chip component in the app. Single size — 11px text, tight
 * padding, --n11-r-sm radius rather than fully rounded (a full pill reads as
 * a toy at this scale). See CLAUDE.md "no inline-styled pills".
 */
export default function Badge({ children, tone = 'neutral', icon, className }: Props) {
  const t = TONE_COLORS[tone]
  return (
    <span
      className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap flex-shrink-0 ${className ?? ''}`}
      style={{
        fontSize: 11,
        padding: '3px 8px',
        borderRadius: RADIUS_SM,
        color: t.color,
        backgroundColor: t.bg,
      }}
    >
      {icon && <Icon icon={icon} size="xs" label={true} />}
      {children}
    </span>
  )
}
