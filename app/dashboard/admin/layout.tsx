import BottomNav from '@/app/dashboard/player/_components/BottomNav'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Persistent logo header */}
      <header
        className="sticky top-0 z-50 flex items-center justify-center px-4 py-3"
        style={{
          backgroundColor: 'rgba(10,10,10,0.97)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1e2235',
        }}
      >
        <img src="/logo.jpg" alt="NEXT11VEN" className="h-9 w-auto" />
      </header>

      <div style={{ paddingBottom: '72px' }}>
        {children}
      </div>

      <BottomNav />
    </div>
  )
}
