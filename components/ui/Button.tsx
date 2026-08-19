'use client'

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import Icon from './Icon'
import { RADIUS_SM } from './tokens'

type Variant = 'primary' | 'secondary' | 'tertiary'
type Size = 'sm' | 'md'

const SIZE: Record<Size, { height: number; paddingInline: number; fontSize: number }> = {
  sm: { height: 32, paddingInline: 12, fontSize: 13 },
  md: { height: 40, paddingInline: 18, fontSize: 14 },
}

// Colour comes from Tailwind arbitrary-value classes (hover: needs a real
// pseudo-class, which inline style can't express) — sizing/radius stay inline
// since they're prop-driven. See components/ui/tokens.ts for where these hex
// values come from and why accent-on-dark (#4d8ae8) isn't accent (#2d5fc4).
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-[#2d5fc4] text-white border border-transparent hover:bg-[#3a6fda]',
  secondary: 'bg-[#13172a] text-[#e8dece] border border-[#1e2235] hover:bg-[#1a1f3a] hover:border-[#2a3150]',
  tertiary: 'bg-transparent text-[#4d8ae8] border border-transparent hover:bg-[rgba(45,95,196,0.1)]',
}

// Shared-prop keys that must never reach the DOM node (or the `{...rest}`
// spread would leak them as invalid attributes) and, critically, must never
// reach `rest` at all — see the button-branch comment below for why letting
// className/style slip through here silently breaks every styled Button.
const OWN_KEYS = ['variant', 'size', 'leadingIcon', 'trailingIcon', 'className', 'style', 'children', 'loading']

type Shared = {
  children: ReactNode
  variant?: Variant
  size?: Size
  /** Leading icon, 16px, colour inherited from the button's own text colour. */
  leadingIcon?: LucideIcon
  /** Trailing icon, 16px, colour inherited from the button's own text colour. */
  trailingIcon?: LucideIcon
  className?: string
  style?: CSSProperties
}

type ButtonOnlyProps = Shared & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof Shared | 'href'> & {
  href?: undefined
  /** Shows a spinner in place of the label without changing the button's width. Action buttons only — a link can't be "loading". */
  loading?: boolean
}

type LinkProps = Shared & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Shared> & {
  /** Renders as a link (Next.js Link, or a plain `<a>` for external/absolute URLs) instead of a `<button>`. Use for navigation — see CLAUDE.md "navigation, not an action". */
  href: string
  loading?: undefined
}

type Props = ButtonOnlyProps | LinkProps

function useClasses(variant: Variant, className?: string) {
  return [
    'relative inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150 active:scale-[0.98]',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] focus-visible:ring-[#4d8ae8]',
    'disabled:cursor-default disabled:active:scale-100',
    VARIANT_CLASSES[variant],
    className ?? '',
  ].join(' ')
}

function Content({ leadingIcon, trailingIcon, children, loading }: Pick<Shared, 'leadingIcon' | 'trailingIcon' | 'children'> & { loading?: boolean }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1.5 ${loading ? 'invisible' : ''}`}>
      {leadingIcon && <Icon icon={leadingIcon} size="sm" label={true} />}
      {children}
      {trailingIcon && <Icon icon={trailingIcon} size="sm" label={true} />}
    </span>
  )
}

function Spinner() {
  return (
    <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <span
        className="rounded-full border-2 animate-spin motion-reduce:animate-none"
        style={{ width: 16, height: 16, borderColor: 'currentColor', borderTopColor: 'transparent' }}
      />
    </span>
  )
}

/**
 * The one button/nav-link component in the app — see CLAUDE.md "no
 * inline-styled buttons". At most one `variant="primary"` per CONTEXT, not
 * per screen — a repeating list is its own context per row, so a primary
 * Apply/Accept button repeated on every card/row is correct, not a violation.
 * Not enforced by the type system, enforced by review.
 *
 * Pass `href` for navigation (renders a real link — Next.js Link, or `<a>`
 * for absolute/external URLs) instead of `onClick` for an action (renders a
 * `<button>`). Don't fake navigation with an onClick + router.push — a link
 * needs to be a link for cmd-click, right-click, and crawlers to work.
 */
export default function Button(props: Props) {
  const { children, variant = 'primary', size = 'md', leadingIcon, trailingIcon, className, style } = props
  const s = SIZE[size]
  const classes = useClasses(variant, className)
  const baseStyle: CSSProperties = {
    height: s.height,
    paddingInline: s.paddingInline,
    fontSize: s.fontSize,
    borderRadius: RADIUS_SM,
  }

  if (props.href !== undefined) {
    const { href, ...anchorProps } = props
    // Strip the Shared/Button-only keys so only real anchor attributes (target,
    // rel, aria-*, ...) reach the DOM node — and so a caller-passed className/
    // style can't silently override the computed `classes`/baseStyle below via
    // this spread (see OWN_KEYS note on the button branch for why that matters).
    const rest = Object.fromEntries(Object.entries(anchorProps).filter(([k]) => !OWN_KEYS.includes(k)))
    const isExternal = /^https?:\/\//.test(href)
    const inner = <Content leadingIcon={leadingIcon} trailingIcon={trailingIcon}>{children}</Content>
    return isExternal ? (
      <a href={href} className={classes} style={{ ...baseStyle, ...style }} {...rest}>{inner}</a>
    ) : (
      <Link href={href} className={classes} style={{ ...baseStyle, ...style }} {...rest}>{inner}</Link>
    )
  }

  // `rest` must exclude every Shared key (className/style especially) — object
  // spread lets a later key win even when its value came from an unrelated
  // destructure, so `{...rest}` after `className={classes}` would otherwise
  // silently overwrite the computed classes with the caller's raw className
  // (this shipped broken for a while: every Button that passed a className —
  // i.e. nearly every call site — rendered with none of its variant/size
  // styling, just the caller's layout classes).
  const { disabled, loading = false, ...maybeRest } = props as ButtonOnlyProps
  const rest = Object.fromEntries(Object.entries(maybeRest).filter(([k]) => !OWN_KEYS.includes(k)))
  const isDisabled = disabled || loading

  return (
    <button
      disabled={isDisabled}
      className={classes}
      style={{ ...baseStyle, opacity: disabled ? 0.4 : 1, ...style }}
      {...rest}
    >
      <Content leadingIcon={leadingIcon} trailingIcon={trailingIcon} loading={loading}>{children}</Content>
      {loading && <Spinner />}
    </button>
  )
}
