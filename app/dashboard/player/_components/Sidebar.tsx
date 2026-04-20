'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type Props = {
  isOpen: boolean
  onClose: () => void
  profile: { full_name: string | null; avatar_url: string | null; position: string | null } | null
}

export default function Sidebar({ isOpen, onClose, profile }: Props) {
  const router = useRouter()
  const [isPremium, setIsPremium] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('premium, role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setIsPremium(data?.premium ?? false)
          setIsAdmin(data?.role === 'admin')
        })
    })
  }, [])

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

        {/* Profile card */}
        <Link href="/dashboard/player/profile" onClick={onClose}
          className="block mx-4 mt-4 mb-4 rounded-xl overflow-hidden"
          style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', textDecoration: 'none' }}>
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#1a1f3a' }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-base font-black" style={{ color: '#2d5fc4' }}>{initials}</span>}
            </div>
            <div>
              <p className="text-sm font-bold leading-snug" style={{ color: '#e8dece' }}>{profile?.full_name ?? 'Player'}</p>
              <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{profile?.position ?? 'Add your position'}</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 px-4 py-2.5"
            style={{ borderTop: '1px solid rgba(45,95,196,0.3)', backgroundColor: 'rgba(45,95,196,0.08)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#2d5fc4' }}>Edit Profile</span>
          </div>
        </Link>

        {/* Go Premium CTA — only if not premium */}
        {!isPremium && (
          <Link href="/dashboard/player/premium" onClick={onClose}
            className="flex items-center gap-3 mx-4 mb-4 px-4 py-3 rounded-xl"
            style={{ background: 'linear-gradient(135deg, rgba(45,95,196,0.18) 0%, rgba(45,95,196,0.08) 100%)', border: '1px solid rgba(45,95,196,0.35)', textDecoration: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: '#2d5fc4' }}>Go Premium</p>
              <p className="text-xs" style={{ color: '#8892aa' }}>£6.99/month · Get seen faster</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        )}

        {/* Menu items */}
        <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          <Link href="/dashboard/player/players" onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
            style={{ textDecoration: 'none', color: '#8892aa' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
            </svg>
            <p className="text-sm font-semibold">Players</p>
          </Link>

          <Link href="/dashboard/player/coaches" onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
            style={{ textDecoration: 'none', color: '#8892aa' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-sm font-semibold">Coaches</p>
          </Link>

          <Link href="/dashboard/player/profile#notifications" onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
            style={{ textDecoration: 'none', color: '#8892aa' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <p className="text-sm font-semibold">Notification Preferences</p>
          </Link>

          {isAdmin && (
            <>
              <div className="mx-0 my-1" style={{ borderTop: '1px solid #1e2235' }} />
              <Link href="/dashboard/admin" onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                style={{ textDecoration: 'none', color: '#f59e0b' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <p className="text-sm font-semibold">Admin Panel</p>
              </Link>
              <Link href="/dashboard/admin/analytics" onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
                style={{ textDecoration: 'none', color: '#f59e0b' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                <p className="text-sm font-semibold">Analytics</p>
              </Link>
            </>
          )}
        </nav>

        {/* Sign out + legal */}
        <div className="px-4 pt-2" style={{ borderTop: '1px solid #1e2235', paddingBottom: 'calc(64px + env(safe-area-inset-bottom) + 8px)' }}>
          <a
            href="mailto:hello@next11ven.com?subject=Bug%20Report&body=Hi%2C%20I%20spotted%20an%20issue%20on%20NEXT11VEN%3A%0A%0A"
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm"
            style={{ color: '#8892aa', textDecoration: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22c1.1 0 2-.9 2-2H10c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            Report a Bug
          </a>
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
          <div className="flex gap-4 px-4 pb-2">
            <Link href="/privacy" onClick={onClose} className="text-xs" style={{ color: '#4a5568' }}>Privacy</Link>
            <Link href="/terms" onClick={onClose} className="text-xs" style={{ color: '#4a5568' }}>Terms</Link>
          </div>
        </div>
      </div>
    </>
  )
}
