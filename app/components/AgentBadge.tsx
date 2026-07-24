/**
 * The agent signal. An agent is a COACH row with is_agent = true — admin-toggled
 * from the panel. They keep every coach ability except initiating a conversation
 * with another coach. Single source of truth for "is this coach an agent?" —
 * every surface that shows a coach chip should render <AgentBadge /> when true.
 */
export function isAgent(p: { role?: string | null; is_agent?: boolean | null }): boolean {
  return p.role === 'coach' && p.is_agent === true
}

/**
 * AGENT chip — replaces the COACH chip wherever an agent's profile surfaces:
 * coaches browse, coach public profile, the feed. Amber chip (the platform's
 * pending/accent colour — never green, which is availability-only), sits apart
 * from the plain purple coach chip so players can see who they're approaching.
 */
export default function AgentBadge({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const sm = size === 'sm'
  return (
    <span
      className="inline-flex items-center rounded-full font-bold uppercase"
      style={{
        padding: sm ? '2px 8px' : '3px 10px',
        fontSize: sm ? 9 : 10,
        letterSpacing: '0.08em',
        color: '#f59e0b',
        fontFamily: "'Inter', sans-serif",
        backgroundColor: 'rgba(245,158,11,0.15)',
        border: '1px solid rgba(245,158,11,0.3)',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      Agent
    </span>
  )
}
