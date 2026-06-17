import PlayerShell from '@/app/dashboard/player/_components/PlayerShell'

// Shared opportunities route — PlayerShell renders the correct sidebar + bottom
// nav for the signed-in user's role (player or coach), same pattern as /feed.
export default function OpportunitiesLayout({ children }: { children: React.ReactNode }) {
  return <PlayerShell>{children}</PlayerShell>
}
