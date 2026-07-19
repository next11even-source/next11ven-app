'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import CoachBottomNav from '@/app/dashboard/coach/_components/CoachBottomNav'
import CoachSidebar from '@/app/dashboard/coach/_components/CoachSidebar'
import InstallBanner from '@/app/components/InstallBanner'

type SidebarProfile = {
  full_name: string | null
  avatar_url: string | null
  position: string | null
  coaching_role: string | null
}

export default function PlayerShell({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [profile, setProfile] = useState<SidebarProfile | null>(null)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const open = () => setIsOpen(true)
    const close = () => setIsOpen(false)
    window.addEventListener('player:sidebar:open', open)
    window.addEventListener('player:sidebar:close', close)
    return () => {
      window.removeEventListener('player:sidebar:open', open)
      window.removeEventListener('player:sidebar:close', close)
    }
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('full_name, avatar_url, position, role, coaching_role, password_set_at')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setProfile(data)
          setRole(data?.role ?? null)
          if (data && !data.password_set_at) {
            supabase.from('profiles')
              .update({ password_set_at: new Date().toISOString() })
              .eq('id', user.id)
              .then(() => {})
          }
          // Activity touch — powers the tier-blind, activity-first ordering on the
          // player/coach browse lists (order by last_active desc). Throttled to at
          // most one write per browser per day so navigation doesn't spam the DB.
          try {
            const today = new Date().toISOString().slice(0, 10)
            if (localStorage.getItem('n11_last_active_day') !== today) {
              localStorage.setItem('n11_last_active_day', today)
              supabase.from('profiles')
                .update({ last_active: new Date().toISOString() })
                .eq('id', user.id)
                .then(() => {})
            }
          } catch { /* localStorage unavailable — skip the touch */ }
        })
    })
  }, [])

  const isCoach = role === 'coach'

  return (
    <>
      {isCoach
        ? <CoachSidebar isOpen={isOpen} onClose={() => setIsOpen(false)} profile={profile} />
        : <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} profile={profile} />
      }
      <div style={{ paddingBottom: '72px' }}>
        {children}
      </div>
      {role === null ? null : isCoach ? <CoachBottomNav /> : <BottomNav />}
      <InstallBanner />
    </>
  )
}
