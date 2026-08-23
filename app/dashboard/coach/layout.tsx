'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useActivityTouch } from '@/lib/useActivityTouch'
import CoachBottomNav from './_components/CoachBottomNav'
import InstallBanner from '@/app/components/InstallBanner'
import SurnameGate from '@/app/components/SurnameGate'

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [nameProfile, setNameProfile] = useState<{ full_name: string | null; first_name: string | null; last_name: string | null } | null>(null)

  // Coach-only routes (/dashboard/coach/*) don't render PlayerShell, so without
  // this a coach who only checks their dashboard + inbox never registers as
  // active — the exact coach a player is trying to find.
  useActivityTouch(userId)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase.from('profiles').select('password_set_at, full_name, first_name, last_name').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            setNameProfile({ full_name: data.full_name, first_name: data.first_name, last_name: data.last_name })
          }
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
      <SurnameGate
        userId={userId}
        profile={nameProfile}
        onSaved={name => setNameProfile(p => p ? { ...p, ...name, full_name: `${name.first_name} ${name.last_name}` } : p)}
      />
    </div>
  )
}
