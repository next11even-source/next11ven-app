import BottomNav from '@/app/dashboard/player/_components/BottomNav'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <div style={{ paddingBottom: '72px' }}>
        {children}
      </div>
      <BottomNav />
    </div>
  )
}
