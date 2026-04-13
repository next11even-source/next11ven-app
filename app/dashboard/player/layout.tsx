import BottomNav from './_components/BottomNav'

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <div style={{ paddingBottom: '72px' }}>
        {children}
      </div>
      <BottomNav />
    </div>
  )
}
