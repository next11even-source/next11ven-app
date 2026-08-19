import Badge from '@/components/ui/Badge'

/**
 * PRO tier marker — platform-wide, identical for players and coaches (the paid
 * tier isn't role-specific, so there's one component, not a player/coach variant).
 * Thin wrapper around Badge tone="pro" — carries no styles of its own, kept only
 * so call sites stay readable ("ProBadge" says more than "Badge tone=pro" would
 * at a glance).
 *
 * `size` is accepted for backward compatibility with existing call sites but is
 * a no-op — Badge is single-size by design (see components/ui/Badge.tsx).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for call-site backward compatibility, see doc comment above
export default function ProBadge(_props: { size?: 'sm' | 'md' }) {
  return <Badge tone="pro">PRO</Badge>
}
