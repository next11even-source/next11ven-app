'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type NavTab = { label: string; href: string; exact: boolean; isMarket?: boolean; icon: React.ReactNode }

const tabs: NavTab[] = [
  {
    label: 'Home',
    href: '/dashboard/coach',
    exact: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
        <path d="M9 21V12h6v9" />
      </svg>
    ),
  },
  {
    label: 'The Market',
    href: '/dashboard/coach/market',
    exact: false,
    isMarket: true,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="12,7 14.5,9.5 13.5,12.5 10.5,12.5 9.5,9.5" />
        <line x1="12" y1="7" x2="12" y2="2.2" />
        <line x1="14.5" y1="9.5" x2="19" y2="7.5" />
        <line x1="13.5" y1="12.5" x2="17" y2="16" />
        <line x1="10.5" y1="12.5" x2="7" y2="16" />
        <line x1="9.5" y1="9.5" x2="5" y2="7.5" />
      </svg>
    ),
  },
  {
    label: 'Players',
    href: '/dashboard/player/players',
    exact: false,
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
    label: 'Profile',
    href: '/dashboard/profile',
    exact: false,
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
]

export default function CoachBottomNav() {
  const pathname = usePathname()
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [isCoach, setIsCoach] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'coach') return
      setIsCoach(true)

      const { data: convs } = await supabase.from('conversations').select('id').eq('coach_id', user.id)
      if (!convs?.length) return
      const { count } = await supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', convs.map(c => c.id))
        .neq('sender_id', user.id)
        .is('read_at', null)
      setUnreadMessages(count ?? 0)
    })
  }, [])

  function isActive(tab: NavTab) {
    if (tab.isMarket) {
      return pathname.startsWith('/dashboard/coach/market') ||
             pathname.startsWith('/dashboard/coach/messages') ||
             pathname.startsWith('/dashboard/coach/shortlists') ||
             pathname.startsWith('/dashboard/coach/opportunities')
    }
    return tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
  }

  if (!isCoach) return null

  return (
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
        const active = isActive(tab)
        const showBadge = tab.isMarket && unreadMessages > 0
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="flex flex-col items-center gap-1 flex-1 py-2 transition-colors relative"
            style={{ color: active ? '#2d5fc4' : '#8892aa', textDecoration: 'none' }}
          >
            <div className="relative">
              {tab.icon}
              {showBadge && (
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
  )
}
