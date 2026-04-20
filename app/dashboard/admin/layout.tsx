'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import BottomNav from '@/app/dashboard/player/_components/BottomNav'
import Sidebar from '@/app/dashboard/player/_components/Sidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null; position: string | null } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('full_name, avatar_url, position').eq('id', user.id).single()
        .then(({ data }) => setProfile(data))
    })
    function open() { setIsOpen(true) }
    window.addEventListener('player:sidebar:open', open)
    return () => window.removeEventListener('player:sidebar:open', open)
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} profile={profile} />
      <div style={{ paddingBottom: '72px' }}>
        {children}
      </div>
      <BottomNav />
    </div>
  )
}
