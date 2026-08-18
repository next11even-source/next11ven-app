/**
 * PRO tier marker — platform-wide, identical for players and coaches (the paid
 * tier isn't role-specific, so there's one component, not a player/coach variant).
 * Deliberately quieter than FounderBadge/AgentBadge: no pill shape, no border, no
 * icon. It should read as a tier marker sitting beside a name, not a verification
 * credential — if it starts looking like one, make it quieter, not louder.
 *
 * Blue matches the platform's primary brand colour (#2d5fc4) — the paid tier
 * reads as the brand's own colour, distinct from amber (Agent), navy (Founder),
 * and green (availability-only).
 *
 * Replaces the ★ premium indicator that used to sit next to premium users' names.
 * NOTE: design tokens (--n11-premium / --n11-premium-bg) don't exist in this
 * codebase yet — colours are hardcoded inline here to match every other badge
 * component's convention. Swap to the token once a tokens pass lands.
 */
export default function ProBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sm = size === 'sm'
  return (
    <span
      className="inline-flex items-center flex-shrink-0"
      style={{
        fontSize: sm ? 9 : 10,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        padding: sm ? '1px 5px' : '2px 6px',
        borderRadius: 8,
        color: '#4d8ae8',
        backgroundColor: 'rgba(45,95,196,0.14)',
        fontFamily: "'Inter', sans-serif",
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      Pro
    </span>
  )
}
