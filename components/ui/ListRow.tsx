import type { AnchorHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import { COLORS } from './tokens'

type Shared = {
  /** Avatar or other fixed-size lead visual. */
  leading?: ReactNode
  /** ListRow only sets font/colour on the wrapper — it doesn't force
   * `truncate` onto it, since that class breaks a nested flex row of inline
   * badges (Pro/Agent/New next to a name). Wrap your own text node in
   * `truncate` when the title is plain text and needs single-line ellipsis. */
  title: ReactNode
  /** Reserves its line height even when omitted, so rows with and without a
   * subtitle (e.g. a coach with no role/location set) stay the same height
   * and the title never shifts vertically between rows. Same truncation rule
   * as `title` — wrap plain text in your own `truncate` span if needed. */
  subtitle?: ReactNode
  /** Badge, chevron, or other trailing marker. */
  trailing?: ReactNode
  className?: string
  style?: CSSProperties
}

type DivProps = Shared & Omit<HTMLAttributes<HTMLDivElement>, keyof Shared> & { href?: undefined }
type LinkProps = Shared & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Shared> & {
  /** Renders as a real link instead of a `<div>` — the common case for coach/player list rows. */
  href: string
}

type Props = DivProps | LinkProps

const OWN_KEYS = ['leading', 'title', 'subtitle', 'trailing', 'className', 'style']
const MIN_HEIGHT = 64

/**
 * Dense list row for coach/player browse lists — not a card per row. Fixed
 * 64px min-height so rows with missing data (no role, no location) don't
 * collapse and break vertical rhythm.
 *
 * Renders content only — no divider of its own. Wrap a list of ListRows in a
 * container with `divide-y divide-[#1e2235]` so a hairline sits between rows
 * and none renders after the last one; that's the standard Tailwind way to
 * get "no divider after the last child" without every row needing to know
 * its own position in the list.
 */
export default function ListRow(props: Props) {
  const { leading, title, subtitle, trailing, className, style } = props
  const classes = ['flex items-center gap-3', className ?? ''].join(' ')
  const baseStyle: CSSProperties = { minHeight: MIN_HEIGHT, ...style }

  const content = (
    <>
      {leading && <div className="flex-shrink-0">{leading}</div>}
      <div className="flex-1 min-w-0">
        <div className="min-w-0 text-sm font-medium" style={{ color: COLORS.text }}>
          {title}
        </div>
        <div className="min-w-0 truncate text-xs leading-4" style={{ color: COLORS.textMuted2 }}>
          {subtitle ?? ' '}
        </div>
      </div>
      {trailing && <div className="flex-shrink-0">{trailing}</div>}
    </>
  )

  if (props.href !== undefined) {
    const { href, ...anchorProps } = props
    const rest = Object.fromEntries(Object.entries(anchorProps).filter(([k]) => !OWN_KEYS.includes(k)))
    const isExternal = /^https?:\/\//.test(href)
    return isExternal ? (
      <a href={href} className={classes} style={baseStyle} {...rest}>{content}</a>
    ) : (
      <Link href={href} className={classes} style={baseStyle} {...rest}>{content}</Link>
    )
  }

  const rest = Object.fromEntries(Object.entries(props).filter(([k]) => !OWN_KEYS.includes(k) && k !== 'href'))
  return (
    <div className={classes} style={baseStyle} {...rest}>
      {content}
    </div>
  )
}
