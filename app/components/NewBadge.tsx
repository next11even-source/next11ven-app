import { isNewUser } from '@/lib/isNewUser'

type Props = {
  /** Pass the profile's created_at — the badge only renders if the user is within the new-user window. */
  createdAt?: string | null
  /** Skip the date check and always render (useful when the caller already filtered). */
  force?: boolean
  /** sm = compact pill for list rows / overlays, md = default. */
  size?: 'sm' | 'md'
}

/**
 * "NEW" chip shown for users who joined within the last 2 weeks.
 * Used on browse lists, carousels, profile headers and the homepage.
 */
export default function NewBadge({ createdAt, force = false, size = 'md' }: Props) {
  if (!force && !isNewUser(createdAt)) return null

  const isSm = size === 'sm'

  return (
    <span
      className="inline-flex items-center gap-1 font-black uppercase tracking-wider flex-shrink-0"
      style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        fontSize: isSm ? 9 : 10,
        lineHeight: 1,
        padding: isSm ? '2px 6px' : '3px 7px',
        borderRadius: 999,
        color: '#fff',
        background: 'linear-gradient(135deg, #2d5fc4 0%, #3a6fda 100%)',
        boxShadow: '0 0 0 1px rgba(58,111,218,0.4), 0 2px 6px rgba(45,95,196,0.45)',
        letterSpacing: '0.08em',
      }}
    >
      <svg width={isSm ? 7 : 8} height={isSm ? 7 : 8} viewBox="0 0 24 24" fill="#fff" stroke="none" aria-hidden="true">
        <path d="M12 2l2.4 6.9L21 9.3l-5.2 4.3L17.5 21 12 17.1 6.5 21l1.7-7.4L3 9.3l6.6-.4z" />
      </svg>
      New
    </span>
  )
}
