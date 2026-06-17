'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import PlayerOpportunities from './_components/PlayerOpportunities'
import CoachOpportunities from './_components/CoachOpportunities'

// Shared opportunities route for players and coaches. Same underlying
// `opportunities` table; coaches additionally get an "Add Opportunity" button
// and inline management of their own roles.
export default function OpportunitiesPage() {
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)
      supabase.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => {
          setRole(data?.role ?? 'player')
          setLoading(false)
        })
    })
  }, [])

  if (loading || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return role === 'coach'
    ? <CoachOpportunities coachId={userId} />
    : <PlayerOpportunities playerId={userId} />
}
