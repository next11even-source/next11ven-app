'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { Suspense } from 'react'

type Role = 'player' | 'coach' | null

function SuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [role, setRole] = useState<Role>(null)
  const [loading, setLoading] = useState(true)
  const sessionId = searchParams.get('session_id')

  useEffect(() => {
    if (!sessionId) {
      router.replace('/')
      return
    }

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.replace('/'); return }

      // Poll for up to 8 seconds — webhook may not have fired yet
      let attempts = 0
      const poll = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('role, premium')
          .eq('id', user.id)
          .single()

        if (data?.premium || attempts >= 8) {
          setRole(data?.role ?? null)
          setLoading(false)
          return
        }
        attempts++
        setTimeout(poll, 1000)
      }

      await poll()
    })
  }, [sessionId, router])

  const isCoach = role === 'coach'
  const tierLabel = isCoach ? 'Coach Pro' : 'Player Premium'
  const dashboardHref = isCoach ? '/dashboard/coach' : '/dashboard/player'
  const accentColor = isCoach ? '#16a34a' : '#2d5fc4'

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#8892aa' }}>Activating your account…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ backgroundColor: `${accentColor}20`, border: `2px solid ${accentColor}` }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>

      <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#8892aa' }}>
        NEXT11VEN
      </p>
      <h1 className="text-4xl font-black uppercase mb-2"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
        You&apos;re on {tierLabel}
      </h1>
      <p className="text-sm mb-8 max-w-xs" style={{ color: '#8892aa' }}>
        {isCoach
          ? 'Shortlist players, get status alerts, and recruit at full speed.'
          : 'Your profile is now fully unlocked. Coaches can see who you are.'}
      </p>

      <Link href={dashboardHref}
        className="flex items-center justify-center gap-2 w-full max-w-xs py-4 rounded-2xl font-black text-base uppercase tracking-widest"
        style={{ backgroundColor: accentColor, color: '#fff', textDecoration: 'none', fontFamily: "'Barlow Condensed', sans-serif" }}>
        Go to Dashboard
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )
}

export default function PremiumSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
