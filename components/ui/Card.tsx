import type { AnchorHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import { RADIUS_MD } from './tokens'

type Shared = {
  children: ReactNode
  /** Raises to surface-2 + border-strong on hover, 150ms transition. Use when the whole card is a click target. */
  interactive?: boolean
  className?: string
  style?: CSSProperties
}

type DivProps = Shared & Omit<HTMLAttributes<HTMLDivElement>, keyof Shared> & { href?: undefined }
type LinkProps = Shared & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Shared> & {
  /** Renders as a real link (Next.js Link, or `<a>` for external/absolute URLs) instead of a `<div>`. */
  href: string
}

type Props = DivProps | LinkProps

const OWN_KEYS = ['interactive', 'className', 'style', 'children']

// Colour comes from Tailwind arbitrary-value classes (hover: needs a real
// pseudo-class, which inline style can't express — same reasoning as
// Button.tsx). Sizing/radius/padding stay inline since they're fixed, not
// prop-driven, and don't need a pseudo-class.
const BASE_CLASSES = 'bg-[#13172a] border border-[#1e2235]'
const INTERACTIVE_CLASSES = 'transition-colors duration-150 hover:bg-[#1a1f3a] hover:border-[#2a3150]'

/**
 * The one card surface in the app — surface-1 background, hairline border,
 * radius-md, 16px padding. Depth comes from surface lightness + hairline
 * only: no coloured left borders, no coloured outlines, no shadows (see
 * CLAUDE.md "no per-card shadows").
 */
export default function Card(props: Props) {
  const { children, interactive = false, className, style } = props
  const classes = ['block', BASE_CLASSES, interactive ? INTERACTIVE_CLASSES : '', className ?? ''].join(' ')
  const baseStyle: CSSProperties = {
    borderRadius: RADIUS_MD,
    padding: 16,
    ...style,
  }

  if (props.href !== undefined) {
    const { href, ...anchorProps } = props
    const rest = Object.fromEntries(Object.entries(anchorProps).filter(([k]) => !OWN_KEYS.includes(k)))
    const isExternal = /^https?:\/\//.test(href)
    return isExternal ? (
      <a href={href} className={classes} style={baseStyle} {...rest}>{children}</a>
    ) : (
      <Link href={href} className={classes} style={baseStyle} {...rest}>{children}</Link>
    )
  }

  const rest = Object.fromEntries(Object.entries(props).filter(([k]) => !OWN_KEYS.includes(k) && k !== 'href'))
  return (
    <div className={classes} style={baseStyle} {...rest}>
      {children}
    </div>
  )
}
