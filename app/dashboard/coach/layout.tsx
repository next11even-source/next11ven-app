'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import CoachBottomNav from './_components/CoachBottomNav'
import InstallBanner from '@/app/components/InstallBanner'

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('password_set_at').eq('id', user.id).single()
        .then(({ data }) => {
          if (data && !data.password_set_at) {
            supabase.from('profiles')
              .update({ password_set_at: new Date().toISOString() })
              .eq('id', user.id)
              .then(() => {})
          }
        })
    })
  }, [])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <div style={{ paddingBottom: '72px' }}>
        {children}
      </div>
      <CoachBottomNav />
      <InstallBanner />
    </div>
  )
}
