'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import CoachBottomNav from '@/app/dashboard/coach/_components/CoachBottomNav'

type SidebarProfile = {
  full_name: string | null
  avatar_url: string | null
  position: string | null
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
        .select('full_name, avatar_url, position, role, password_set_at')
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
        })
    })
  }, [])

  const isCoach = role === 'coach'

  return (
    <>
      {!isCoach && <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} profile={profile} />}
      <div style={{ paddingBottom: '72px' }}>
        {children}
      </div>
      {role === null ? null : isCoach ? <CoachBottomNav /> : <BottomNav />}
    </>
  )
}
