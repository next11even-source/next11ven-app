'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

type SidebarProfile = {
  full_name: string | null
  avatar_url: string | null
  position: string | null
}

export default function PlayerShell({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [profile, setProfile] = useState<SidebarProfile | null>(null)

  // Listen for open/close events dispatched by any page
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

  // Fetch profile for sidebar display
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('full_name, avatar_url, position')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  return (
    <>
      <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} profile={profile} />
      <div style={{ paddingBottom: '72px' }}>
        {children}
      </div>
      <BottomNav />
    </>
  )
}
