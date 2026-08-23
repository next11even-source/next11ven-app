import Badge from '@/components/ui/Badge'
import { isNewUser } from '@/lib/isNewUser'

type Props = {
  /** Pass the profile's created_at — the badge only renders if the user is within the new-user window. */
  createdAt?: string | null
  /** Skip the date check and always render (useful when the caller already filtered). */
  force?: boolean
  /** Accepted for backward compatibility with existing call sites but is a
   * no-op — Badge is single-size by design (see components/ui/Badge.tsx). */
  size?: 'sm' | 'md'
}

/**
 * "NEW" chip shown for users who joined within the last 2 weeks.
 * Used on browse lists, carousels, profile headers and the homepage.
 * Thin wrapper around Badge tone="neutral" — the star glyph this used to
 * carry was dropped (22 Aug 2026), same call as ProBadge dropping its star:
 * stars read as a rating/premium signal, not a recency one. Tone was
 * `accent` until this same pass, but accentOnDark and pro resolve to the
 * identical hex (#4d8ae8) in tokens.ts, so New and PRO were indistinguishable
 * sitting next to each other on a card. Neutral fits better anyway — New is a
 * temporal marker, not a paid tier, and blue should stay reserved for Pro.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- size kept for call-site backward compatibility, see doc comment above
export default function NewBadge({ createdAt, force = false, size = 'md' }: Props) {
  if (!force && !isNewUser(createdAt)) return null
  return <Badge tone="neutral">New</Badge>
}
