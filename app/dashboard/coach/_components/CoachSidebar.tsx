'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type Props = {
  isOpen: boolean
  onClose: () => void
  profile: { full_name: string | null; avatar_url: string | null; coaching_role: string | null } | null
}

export default function CoachSidebar({ isOpen, onClose, profile }: Props) {
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

        {/* Profile pill */}
        <Link href="/dashboard/profile" onClick={onClose}
          className="flex items-center gap-3 mx-4 mt-4 mb-4 px-4 py-3 rounded-xl"
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

        {/* Coach Pro CTA — only if not premium */}
        {!isPremium && (
          <Link href="/dashboard/coach/premium" onClick={onClose}
            className="flex items-center gap-3 mx-4 mb-4 px-4 py-3 rounded-xl"
            style={{ background: 'linear-gradient(135deg, rgba(22,163,74,0.18) 0%, rgba(22,163,74,0.08) 100%)', border: '1px solid rgba(22,163,74,0.35)', textDecoration: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: '#16a34a' }}>Coach Pro</p>
              <p className="text-xs" style={{ color: '#8892aa' }}>£9.99/month · Recruit faster</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        )}

        {/* Secondary nav */}
        <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          <Link href="/dashboard/profile" onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
            style={{ textDecoration: 'none', color: '#8892aa' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <p className="text-sm font-semibold">Settings</p>
          </Link>

          <Link href="/dashboard/profile#notifications" onClick={onClose}
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
