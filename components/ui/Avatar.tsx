import Image from 'next/image'
import { User } from 'lucide-react'
import Icon from './Icon'
import { COLORS } from './tokens'

type Props = {
  url: string | null
  // Used only as the <img> alt text — never rendered as initials.
  name?: string | null
  size?: number
  // Coach identity uses a distinct purple across the app (COLORS.coachIdentity)
  // — pass it explicitly rather than deriving role here, since callers already
  // know it and some (feed authors, generic viewer lists) mix both roles.
  iconColor?: string
  className?: string
  style?: React.CSSProperties
}

/**
 * The single avatar primitive — image when the profile has one, otherwise a
 * blank silhouette (no initials: nothing here identifies who it is, so there's
 * nothing meaningful to abbreviate). Replaces ~20 duplicated initials
 * implementations across player/coach surfaces (26 Aug 2026).
 */
export default function Avatar({ url, name, size = 40, iconColor = COLORS.textMuted2, className, style }: Props) {
  return (
    <div
      className={`rounded-full overflow-hidden flex items-center justify-center flex-shrink-0${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, backgroundColor: COLORS.surface2, ...style }}
    >
      {url
        ? <Image src={url} alt={name ?? ''} width={size} height={size} className="w-full h-full object-cover object-center" />
        : <Icon icon={User} size={Math.round(size * 0.55)} label={true} style={{ color: iconColor }} />}
    </div>
  )
}
