import type { LucideIcon } from 'lucide-react'

// xs (12px) isn't part of the sm/md/lg scale callers pick from — it exists only
// for icons sitting inside a pill-shaped badge/chip, where 16px overpowers the
// text next to it. Button icons use sm (16px); badge icons use xs (12px).
const SIZE_PX = { xs: 12, sm: 16, md: 20, lg: 24 } as const

type Props = {
  icon: LucideIcon
  size?: keyof typeof SIZE_PX
  className?: string
  style?: React.CSSProperties
  /**
   * Every icon declares its own accessibility role — there's no silent default.
   * Pass `true` for a decorative icon sitting next to its own visible text label
   * (renders aria-hidden). Pass a string for an icon that stands alone with no
   * adjacent text — e.g. an icon-only button — and that string becomes the
   * aria-label naming what it does.
   */
  label: string | true
}

/**
 * Every icon in the app renders through here — fixed stroke weight, fixed size
 * scale, colour always inherited from the parent (currentColor), never passed
 * as a prop. Swap the lucide-react icon component in, don't reach for raw SVGs
 * or emoji.
 */
export default function Icon({ icon: IconComponent, size = 'md', className, style, label }: Props) {
  const a11yProps = label === true
    ? { 'aria-hidden': true as const }
    : { 'aria-label': label, role: 'img' as const }

  return (
    <IconComponent
      size={SIZE_PX[size]}
      strokeWidth={1.75}
      className={className}
      style={style}
      {...a11yProps}
    />
  )
}
