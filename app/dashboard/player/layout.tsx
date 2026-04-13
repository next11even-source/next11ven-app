import PlayerShell from './_components/PlayerShell'

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return <PlayerShell>{children}</PlayerShell>
}
