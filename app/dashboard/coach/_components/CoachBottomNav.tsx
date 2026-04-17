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

export default function CoachBottomNav() {
  const pathname = usePathname()
  const [isCoach, setIsCoach] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [unreadAlerts, setUnreadAlerts] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastCounter = useRef(0)
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
    const supabase = createClient()
    let msgSub: ReturnType<typeof supabase.channel> | null = null
    let alertSub: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'coach') return
      setIsCoach(true)

      // Unread messages
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('coach_id', user.id)
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

      // Unread shortlist alerts
      const { count: alertCount } = await supabase
        .from('shortlist_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', user.id)
        .eq('is_read', false)
      setUnreadAlerts(alertCount ?? 0)

      // Realtime: new messages
      msgSub = supabase
        .channel(`coach-messages-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        }, async (payload) => {
          const msg = payload.new as { sender_id: string; conversation_id: string }
          if (msg.sender_id === user.id) return
          if (!convIdsRef.current.includes(msg.conversation_id)) return
          setUnreadMessages(prev => prev + 1)
          const { data: sender } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', msg.sender_id)
            .single()
          const name = sender?.full_name?.split(' ')[0] ?? 'A player'
          addToast(`${name} sent you a message`, '/dashboard/coach/messages')
        })
        .subscribe()

      // Realtime: shortlist alerts
      alertSub = supabase
        .channel(`coach-alerts-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'shortlist_alerts',
          filter: `coach_id=eq.${user.id}`,
        }, async (payload) => {
          const alert = payload.new as { player_id: string; new_status: string }
          setUnreadAlerts(prev => prev + 1)
          const { data: player } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', alert.player_id)
            .single()
          const name = player?.full_name?.split(' ')[0] ?? 'A player'
          const status = alert.new_status?.replace(/_/g, ' ') ?? 'updated their status'
          addToast(`${name} is now ${status}`, '/dashboard/coach/shortlists')
        })
        .subscribe()
    })

    return () => {
      if (msgSub) msgSub.unsubscribe()
      if (alertSub) alertSub.unsubscribe()
    }
  }, [])

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href)
  }

  if (!isCoach) return null

  const tabs = [
    {
      label: 'Home',
      href: '/dashboard/coach',
      exact: true,
      badge: null as null | { count: number; color: string; amber?: boolean },
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
          <path d="M9 21V12h6v9" />
        </svg>
      ),
    },
    {
      label: 'Players',
      href: '/dashboard/player/players',
      exact: false,
      badge: null as null | { count: number; color: string; amber?: boolean },
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="7" r="4" />
          <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
        </svg>
      ),
    },
    {
      label: 'Messages',
      href: '/dashboard/coach/messages',
      exact: false,
      badge: unreadMessages > 0 ? { count: unreadMessages, color: '#ef4444' } : null,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      label: 'Opportunities',
      href: '/dashboard/coach/opportunities',
      exact: false,
      badge: null as null | { count: number; color: string; amber?: boolean },
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
      label: 'Shortlists',
      href: '/dashboard/coach/shortlists',
      exact: false,
      badge: unreadAlerts > 0 ? { count: unreadAlerts, color: '#f59e0b', amber: true } : null,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
  ]

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
        {tabs.map((tab) => {
          const active = isActive(tab.href, tab.exact)
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className="flex flex-col items-center gap-1 flex-1 py-2 transition-colors relative"
              style={{ color: active ? '#2d5fc4' : '#8892aa', textDecoration: 'none' }}
            >
              <div className="relative">
                {tab.icon}
                {tab.badge && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor: tab.badge.color,
                      color: tab.badge.amber ? '#0a0a0a' : '#fff',
                      fontSize: 10,
                      border: '1.5px solid #0d1020',
                    }}
                  >
                    {tab.badge.count > 9 ? '9+' : tab.badge.count}
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
