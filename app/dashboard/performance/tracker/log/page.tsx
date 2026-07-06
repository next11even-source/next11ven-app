'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Breadcrumb from '@/app/components/Breadcrumb'
import MatchForm, { type MatchFormValues, type NewStintValues } from '../../_components/MatchForm'
import type { ClubStint } from '@/lib/performance'

// Fast entry: date pre-filled to the most recent Saturday, position and club
// remembered from the last logged match.
function lastSaturday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7))
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function LogMatchPage() {
  const router = useRouter()
  const [stints, setStints] = useState<ClubStint[] | null>(null)
  const [initial, setInitial] = useState<MatchFormValues | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/performance/summary')
      .then(r => {
        if (r.status === 403) { router.push('/dashboard/performance/tracker'); return null }
        return r.ok ? r.json() : null
      })
      .then(data => {
        if (!data) return
        // Logging is the paid action — read-only players go to the upgrade page
        if (data.access === 'readonly') { router.push('/dashboard/player/premium'); return }
        setStints(data.stints ?? [])
        const activeStint = (data.activeStint as ClubStint | null) ?? null
        setInitial({
          match_date: lastSaturday(),
          opponent: '',
          competition_type: 'league',
          competition_name: null,
          // Remembered defaults: last stint used if still ongoing, else active stint
          stint_id: data.defaults?.stint_id && (data.stints as ClubStint[]).some(s => s.id === data.defaults.stint_id && !s.end_date)
            ? data.defaults.stint_id
            : activeStint?.id ?? null,
          goals_for: null,
          goals_against: null,
          started: true,
          position: data.defaults?.position ?? null,
          minutes_played: 90,
          goals: 0,
          assists: 0,
          penalty_saves: 0,
          rating: null,
          notes: null,
          tags: [],
        })
      })
      .catch(() => setError('Could not load your tracker. Pull to refresh or try again.'))
  }, [router])

  async function handleSubmit(values: MatchFormValues, newStint: NewStintValues | null) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      let stintId = values.stint_id

      if (newStint) {
        const stintRes = await fetch('/api/performance/stints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            club_name: newStint.club_name,
            level: newStint.level,
            stint_type: newStint.stint_type,
            start_date: values.match_date,
            // Moving clubs closes the old stint; a trial runs alongside it
            close_others: newStint.stint_type !== 'trial',
          }),
        })
        const stintData = await stintRes.json()
        if (!stintRes.ok) {
          setError(stintData.error ?? 'Could not save your new club')
          setBusy(false)
          return
        }
        stintId = stintData.stint.id
      }

      const res = await fetch('/api/performance/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, stint_id: stintId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not log the match')
        setBusy(false)
        return
      }
      router.push('/dashboard/performance/tracker')
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="px-4 pt-3 pb-3" style={{ borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[
          { label: 'Home', href: '/dashboard/player' },
          { label: 'Game Performance Tracker', href: '/dashboard/performance/tracker' },
          { label: 'Log a match' },
        ]} />
      </div>

      <div className="px-4 pt-6 max-w-lg mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-black uppercase leading-tight"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Log a match
          </h1>
          <p className="text-sm mt-1.5" style={{ color: '#8892aa' }}>
            How did it go? This stays private to you.
          </p>
        </div>

        {initial && stints !== null ? (
          <MatchForm
            initial={initial}
            stints={stints}
            submitLabel="Save match"
            busy={busy}
            error={error}
            onSubmit={handleSubmit}
            onCancel={() => router.push('/dashboard/performance/tracker')}
          />
        ) : (
          <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>{error ?? 'Loading…'}</p>
          </div>
        )}
      </div>
    </div>
  )
}
