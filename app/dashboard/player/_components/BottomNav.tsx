'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type Toast = { id: number; text: string; href: string }

function ToastNotification({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const router = useRouter()
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 left-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg"
          style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4' }}>
          <p className="flex-1 text-sm font-semibold" style={{ color: '#e8dece' }}>{t.text}</p>
          <button onClick={() => { onDismiss(t.id); router.push(t.href) }}
            className="text-xs px-3 py-1 rounded-lg flex-shrink-0"
            style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
            View
          </button>
          <button onClick={() => onDismiss(t.id)} style={{ color: '#8892aa' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

const adminTab = {
  label: 'Admin',
  href: '/dashboard/admin',
  exact: false,
  marketTab: null as null | string,
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
}

export default function BottomNav() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [hasNewActivity, setHasNewActivity] = useState(false)
  const [marketTabParam, setMarketTabParam] = useState('')
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastCounter = useRef(0)
  const userIdRef = useRef<string | null>(null)
  const convIdsRef = useRef<string[]>([])

  function addToast(text: string, href: string) {
    const id = ++toastCounter.current
    setToasts(prev => [...prev, { id, text, href }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  function dismissToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    // Read ?tab= from URL without useSearchParams (avoids Suspense requirement)
    const params = new URLSearchParams(window.location.search)
    setMarketTabParam(params.get('tab') ?? '')
  }, [pathname])

  useEffect(() => {
    const supabase = createClient()
    let realtimeSub: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      userIdRef.current = user.id

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, last_active')
        .eq('id', user.id)
        .single()

      setIsAdmin(profile?.role === 'admin')

      // Unread message count — conversations where this user is the player
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('player_id', user.id)

      const convIds = (convs ?? []).map((c: { id: string }) => c.id)
      convIdsRef.current = convIds

      if (convIds.length) {
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', convIds)
          .neq('sender_id', user.id)
          .is('read_at', null)
        setUnreadMessages(count ?? 0)
      }

      // New profile views since last_active
      if (profile?.last_active) {
        const { count: viewCount } = await supabase
          .from('player_views')
          .select('id', { count: 'exact', head: true })
          .eq('player_id', user.id)
          .gt('viewed_at', profile.last_active)
        setHasNewActivity((viewCount ?? 0) > 0)
      }

      // Realtime: new messages
      realtimeSub = supabase
        .channel(`player-messages-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        }, async (payload) => {
          const msg = payload.new as { sender_id: string; conversation_id: string; content: string }
          if (msg.sender_id === user.id) return
          if (!convIdsRef.current.includes(msg.conversation_id)) return
          setUnreadMessages(prev => prev + 1)
          // Look up sender name
          const { data: sender } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', msg.sender_id)
            .single()
          const name = sender?.full_name?.split(' ')[0] ?? 'A coach'
          addToast(`${name} sent you a message`, '/dashboard/player/messages')
        })
        .subscribe()
    })

    return () => {
      if (realtimeSub) realtimeSub.unsubscribe()
    }
  }, [])

  function isActive(href: string, exact: boolean, tabParam?: string | null) {
    if (exact) return pathname === href
    if (tabParam !== undefined && tabParam !== null) {
      // Market sub-tabs: active when on market page with matching tab param
      if (!pathname.startsWith('/dashboard/player/market')) return false
      if (!tabParam) return marketTabParam === '' || marketTabParam === 'opportunities'
      return marketTabParam === tabParam
    }
    return pathname.startsWith(href)
  }

  const baseTabs = [
    {
      label: 'Home',
      href: '/dashboard/player',
      exact: true,
      marketTab: null as null | string,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
          <path d="M9 21V12h6v9" />
        </svg>
      ),
    },
    {
      label: 'Messages',
      href: '/dashboard/player/messages',
      exact: false,
      marketTab: null as null | string,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      label: 'Opportunities',
      href: '/dashboard/player/market?tab=opportunities',
      exact: false,
      marketTab: 'opportunities' as null | string,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <line x1="12" y1="12" x2="12" y2="16" />
          <line x1="10" y1="14" x2="14" y2="14" />
        </svg>
      ),
    },
    {
      label: 'Activity',
      href: '/dashboard/player/market?tab=activity',
      exact: false,
      marketTab: 'activity' as null | string,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      label: 'Profile',
      href: '/dashboard/player/profile',
      exact: false,
      marketTab: null as null | string,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      ),
    },
  ]

  const allTabs = isAdmin ? [...baseTabs, adminTab] : baseTabs

  return (
    <>
    <ToastNotification toasts={toasts} onDismiss={dismissToast} />
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2"
      style={{
        backgroundColor: 'rgba(13,16,32,0.97)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid #1e2235',
        height: '64px',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {allTabs.map((tab) => {
        const active = isActive(tab.href, tab.exact, tab.marketTab)
        const showMessageBadge = tab.label === 'Messages' && unreadMessages > 0
        const showActivityBadge = tab.label === 'Activity' && hasNewActivity

        return (
          <Link
            key={tab.label}
            href={tab.href}
            className="flex flex-col items-center gap-1 flex-1 py-2 transition-colors relative"
            style={{ color: active ? '#2d5fc4' : '#8892aa', textDecoration: 'none' }}
          >
            <div className="relative">
              {tab.icon}
              {showMessageBadge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: '#2d5fc4', color: '#fff', fontSize: 10, border: '1.5px solid #0d1020' }}>
                  {unreadMessages > 9 ? '9+' : unreadMessages}
                </span>
              )}
              {showActivityBadge && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-pulse"
                  style={{ backgroundColor: '#f87171', border: '1.5px solid #0d1020' }} />
              )}
            </div>
            <span className="text-xs" style={{ fontFamily: "'Inter', sans-serif", fontWeight: active ? 600 : 400 }}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
    </>
  )
}
