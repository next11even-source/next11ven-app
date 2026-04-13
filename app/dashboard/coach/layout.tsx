import CoachBottomNav from './_components/CoachBottomNav'

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <div style={{ paddingBottom: '72px' }}>
        {children}
      </div>
      <CoachBottomNav />
    </div>
  )
}
