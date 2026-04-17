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

export default function BottomNav() {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [hasNewActivity, setHasNewActivity] = useState(false)
  const [pendingSignups, setPendingSignups] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastCounter = useRef(0)
  const userIdRef = useRef<string | null>(null)
  const convIdsRef = useRef<string[]>([])

  function addToast(text: string, href: string) {
    const id = ++toastCounter.current
    setToasts(prev => [...prev, { id, text, href }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }

  function dismissToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    const supabase = createClient()
    let messageSub: ReturnType<typeof supabase.channel> | null = null
    let signupSub: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      userIdRef.current = user.id

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, last_active')
        .eq('id', user.id)
        .single()

      const admin = profile?.role === 'admin'
      setIsAdmin(admin)

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

      // Admin: fetch current pending count
      if (admin) {
        const { count: pendingCount } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('approval_status', 'pending')
        setPendingSignups(pendingCount ?? 0)
      }

      // Realtime: new messages
      messageSub = supabase
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
          const { data: sender } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', msg.sender_id)
            .single()
          const name = sender?.full_name?.split(' ')[0] ?? 'A coach'
          addToast(`${name} sent you a message`, '/dashboard/player/messages')
        })
        .subscribe()

      // Admin realtime: new profile sign-ups
      if (admin) {
        signupSub = supabase
          .channel(`admin-signups-${user.id}`)
          .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'profiles',
          }, (payload) => {
            const p = payload.new as { full_name: string | null; role: string | null }
            setPendingSignups(prev => prev + 1)
            const name = p.full_name?.split(' ')[0] ?? 'Someone'
            const roleLabel = p.role === 'coach' ? 'coach' : 'player'
            addToast(`${name} just signed up as a ${roleLabel}`, '/dashboard/admin')
          })
          .subscribe()
      }
    })

    return () => {
      if (messageSub) messageSub.unsubscribe()
      if (signupSub) signupSub.unsubscribe()
    }
  }, [])

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const baseTabs = [
    {
      label: 'Home',
      href: '/dashboard/player',
      exact: true,
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
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      label: 'Opportunities',
      href: '/dashboard/player/opportunities',
      exact: false,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
    {
      label: 'Activity',
      href: '/dashboard/player/activity',
      exact: false,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
  ]

  const adminTab = {
    label: 'Admin',
    href: '/dashboard/admin',
    exact: false,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  }

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
        const active = isActive(tab.href, tab.exact)
        const showMessageBadge = tab.label === 'Messages' && unreadMessages > 0
        const showActivityBadge = tab.label === 'Activity' && hasNewActivity
        const showAdminBadge = tab.label === 'Admin' && pendingSignups > 0

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
              {showAdminBadge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold"
                  style={{ backgroundColor: '#f59e0b', color: '#0a0a0a', fontSize: 10, border: '1.5px solid #0d1020' }}>
                  {pendingSignups > 9 ? '9+' : pendingSignups}
                </span>
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
