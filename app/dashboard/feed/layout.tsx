import PlayerShell from '@/app/dashboard/player/_components/PlayerShell'

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <PlayerShell>{children}</PlayerShell>
}
