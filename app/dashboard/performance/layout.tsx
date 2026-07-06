import { notFound } from 'next/navigation'
import PlayerShell from '@/app/dashboard/player/_components/PlayerShell'
import { performanceTrackerEnabled } from '@/lib/performance'

// /dashboard/performance/* — Performance namespace (currently just the Game
// Performance Tracker; future siblings slot in beside /tracker). The global
// kill switch 404s the whole namespace regardless of premium status.
export default function PerformanceLayout({ children }: { children: React.ReactNode }) {
  if (!performanceTrackerEnabled()) notFound()
  return <PlayerShell>{children}</PlayerShell>
}
