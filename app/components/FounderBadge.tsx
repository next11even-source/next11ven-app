/**
 * The founder signal. Jamal (the only admin account) IS the founder — so the
 * admin role doubles as the founder flag. Single source of truth: if we ever
 * add another admin who is NOT the founder, change the rule here only.
 */
export function isFounder(role: string | null | undefined): boolean {
  return role === 'admin'
}

/**
 * FOUNDER chip — shown next to Jamal's name everywhere his profile surfaces:
 * player/coach lists, carousels, homepage marquees, public profile and the feed.
 * Navy chip, white text — clean and official, sits apart from the plain role chips.
 */
export default function FounderBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sm = size === 'sm'
  return (
    <span
      className="inline-flex items-center rounded-full font-bold uppercase"
      style={{
        padding: sm ? '2px 8px' : '3px 10px',
        fontSize: sm ? 9 : 10,
        letterSpacing: '0.08em',
        color: '#ffffff',
        fontFamily: "'Inter', sans-serif",
        backgroundColor: '#1b2a52',
        border: '1px solid rgba(255,255,255,0.28)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      Founder
    </span>
  )
}
