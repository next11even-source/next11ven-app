'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Bell, Briefcase, Home, MessageCircle, Users } from 'lucide-react'
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
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [pendingSignups, setPendingSignups] = useState(0)
  const [unseenFeed, setUnseenFeed] = useState(0)
  const [unseenOpps, setUnseenOpps] = useState(0)
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
    let notifSub: ReturnType<typeof supabase.channel> | null = null
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

      // Unread messages
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

      // Unread notifications
      const { count: notifCount } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false)
      setUnreadNotifications(notifCount ?? 0)

      // Unseen feed posts since last visit
      const feedLastSeen = (typeof window !== 'undefined' && localStorage.getItem('n11v_feed_last_seen')) || new Date(0).toISOString()
      const { count: feedCount } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('is_deleted', false)
        .gt('created_at', feedLastSeen)
        .neq('author_id', user.id)
      setUnseenFeed(feedCount ?? 0)

      // Unseen opportunities since last visit
      const oppsLastSeen = (typeof window !== 'undefined' && localStorage.getItem('n11v_opps_last_seen')) || new Date(0).toISOString()
      const { count: oppsCount } = await supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .gt('created_at', oppsLastSeen)
      setUnseenOpps(oppsCount ?? 0)

      // Admin: pending signups
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

      // Realtime: new notifications
      notifSub = supabase
        .channel(`player-notifications-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`,
        }, (payload) => {
          const n = payload.new as { message: string }
          setUnreadNotifications(prev => prev + 1)
          addToast(n.message, '/dashboard/player/activity')
        })
        .subscribe()

      // Admin realtime: new sign-ups
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
      if (notifSub) notifSub.unsubscribe()
      if (signupSub) signupSub.unsubscribe()
    }
  }, [])

  // Clear badges when the user lands on the respective pages
  useEffect(() => {
    if (pathname.startsWith('/dashboard/feed')) {
      localStorage.setItem('n11v_feed_last_seen', new Date().toISOString())
      setUnseenFeed(0)
    }
    if (pathname.startsWith('/dashboard/player/opportunities') || pathname.startsWith('/dashboard/player/market')) {
      localStorage.setItem('n11v_opps_last_seen', new Date().toISOString())
      setUnseenOpps(0)
    }
    if (pathname.startsWith('/dashboard/player/activity')) {
      setUnreadNotifications(0)
    }
  }, [pathname])

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const baseTabs = [
    {
      label: 'Home',
      href: '/dashboard/player',
      exact: true,
      icon: <Home size={22} strokeWidth={1.8} />,
    },
    {
      label: 'Coaches',
      href: '/dashboard/player/coaches',
      exact: false,
      icon: <Users size={22} strokeWidth={1.8} />,
    },
    {
      label: 'Explore',
      href: '/dashboard/player/opportunities',
      exact: false,
      icon: <Briefcase size={22} strokeWidth={1.8} />,
    },
    {
      label: 'Messages',
      href: '/dashboard/player/messages',
      exact: false,
      icon: <MessageCircle size={22} strokeWidth={1.8} />,
    },
    {
      label: 'Alerts',
      href: '/dashboard/player/activity',
      exact: false,
      icon: <Bell size={22} strokeWidth={1.8} />,
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
        const showNotifBadge = tab.label === 'Alerts' && unreadNotifications > 0
        const showAdminBadge = tab.label === 'Admin' && pendingSignups > 0
        const showFeedBadge = false
        const showOppsBadge = tab.label === 'Explore' && unseenOpps > 0

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
              {showNotifBadge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: 10, border: '1.5px solid #0d1020' }}>
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
              {showAdminBadge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold"
                  style={{ backgroundColor: '#f59e0b', color: '#0a0a0a', fontSize: 10, border: '1.5px solid #0d1020' }}>
                  {pendingSignups > 9 ? '9+' : pendingSignups}
                </span>
              )}
              {showFeedBadge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold"
                  style={{ backgroundColor: '#f59e0b', color: '#0a0a0a', fontSize: 10, border: '1.5px solid #0d1020' }}>
                  {unseenFeed > 9 ? '9+' : unseenFeed}
                </span>
              )}
              {showOppsBadge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-bold"
                  style={{ backgroundColor: '#f59e0b', color: '#0a0a0a', fontSize: 10, border: '1.5px solid #0d1020' }}>
                  {unseenOpps > 9 ? '9+' : unseenOpps}
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
