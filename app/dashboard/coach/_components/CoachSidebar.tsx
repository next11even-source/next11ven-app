'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Props = {
  isOpen: boolean
  onClose: () => void
  profile: { full_name: string | null; avatar_url: string | null; coaching_role: string | null } | null
}

const NAV_ITEMS = [
  {
    href: '/dashboard/coach',
    exact: true,
    label: 'Home',
    sub: 'Your dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    href: '/dashboard/player/players',
    exact: false,
    label: 'Players',
    sub: 'Browse & discover',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7" r="4" />
        <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    href: '/dashboard/coach/market',
    exact: false,
    label: 'The Market',
    sub: 'Messages, opportunities & more',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/coach/shortlists',
    exact: false,
    label: 'Shortlists',
    sub: 'Saved players',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/coach/opportunities',
    exact: false,
    label: 'Opportunities',
    sub: 'Post & manage roles',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        <line x1="12" y1="12" x2="12" y2="16" />
        <line x1="10" y1="14" x2="14" y2="14" />
      </svg>
    ),
  },
  {
    href: '/dashboard/profile',
    exact: false,
    label: 'My Profile',
    sub: 'Edit your details',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
]

export default function CoachSidebar({ isOpen, onClose, profile }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  async function handleSignOut() {
    onClose()
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  const initials = profile?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 transition-opacity"
        style={{
          backgroundColor: 'rgba(0,0,0,0.7)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 left-0 bottom-0 z-50 flex flex-col"
        style={{
          width: 280,
          backgroundColor: '#0d1020',
          borderRight: '1px solid #1e2235',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-6 pb-4" style={{ borderBottom: '1px solid #1e2235' }}>
          <img src="/logo.jpg" alt="NEXT11VEN" className="h-7 w-auto" />
          <button onClick={onClose} style={{ color: '#8892aa' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Profile pill */}
        <Link href="/dashboard/profile" onClick={onClose}
          className="flex items-center gap-3 mx-4 mt-4 mb-2 px-4 py-3 rounded-xl"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none' }}>
          <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#1a1f3a' }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-sm font-black" style={{ color: '#a78bfa' }}>{initials}</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{profile?.full_name ?? 'Coach'}</p>
            <p className="text-xs truncate" style={{ color: '#8892aa' }}>{profile?.coaching_role ?? 'View profile →'}</p>
          </div>
        </Link>

        {/* Premium CTA */}
        <Link href="/dashboard/player/premium" onClick={onClose}
          className="flex items-center gap-3 mx-4 mb-2 px-4 py-3 rounded-xl"
          style={{ background: 'linear-gradient(135deg, rgba(194,65,12,0.18) 0%, rgba(194,65,12,0.08) 100%)', border: '1px solid rgba(194,65,12,0.35)', textDecoration: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: '#c2410c' }}>Coach Pro</p>
            <p className="text-xs" style={{ color: '#8892aa' }}>£9.99/month · Recruit faster</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          {NAV_ITEMS.map(item => {
            const active = isActive(item.href, item.exact)
            return (
              <Link key={item.href} href={item.href} onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                style={{
                  backgroundColor: active ? '#2d5fc420' : 'transparent',
                  border: `1px solid ${active ? '#2d5fc440' : 'transparent'}`,
                  textDecoration: 'none',
                  color: active ? '#e8dece' : '#8892aa',
                }}>
                <span style={{ color: active ? '#2d5fc4' : '#8892aa' }}>{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.label}</p>
                  {item.sub && <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{item.sub}</p>}
                </div>
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <div className="px-4 pt-2" style={{ borderTop: '1px solid #1e2235', paddingBottom: 'calc(64px + env(safe-area-inset-bottom) + 8px)' }}>
          <button onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm"
            style={{ color: '#8892aa' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </>
  )
}
