'use client'

// Standing "place your season" nudge — fires for ANY player who has legacy
// manual stats but no career_stats rows (the season string couldn't be placed
// at backfill, or they're a new player who typed an unreadable season). We
// prefill everything from their profile; they only supply the missing season,
// and the row lands as self-reported career history. NEVER guesses the year —
// the player places it, which is the correct repair path.

import { useEffect, useState } from 'react'
import { seasonLabel, seasonStartYear } from '@/lib/performance'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }

type Legacy = {
  goals: number
  assists: number
  appearances: number
  season: string | null
  club_name: string | null
  level: string | null
  position: string | null
}

export default function PlaceSeasonNudge({ onPlaced }: { onPlaced?: () => void }) {
  const [legacy, setLegacy] = useState<Legacy | null>(null)
  const [year, setYear] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch('/api/performance/career-stats')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.legacy) setLegacy(d.legacy) })
      .catch(() => {})
  }, [])

  if (!legacy || dismissed || done) return null

  // Season options: this season back ~15 years, newest first.
  const current = seasonStartYear()
  const years = Array.from({ length: 16 }, (_, i) => current - i)

  async function place() {
    if (year === '' || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/performance/career-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season_start_year: year,
          club_name: legacy!.club_name,
          level: legacy!.level,
          position: legacy!.position,
          apps: legacy!.appearances,
          goals: legacy!.goals,
          assists: legacy!.assists,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not save'); setBusy(false); return }
      setDone(true)
      onPlaced?.()
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  const line = [
    `${legacy.appearances} app${legacy.appearances === 1 ? '' : 's'}`,
    `${legacy.goals}G`,
    `${legacy.assists}A`,
  ].join(' · ')

  return (
    <div className="rounded-2xl p-4 space-y-3"
      style={{ border: '1px solid rgba(45,95,196,0.4)', background: 'linear-gradient(160deg, rgba(45,95,196,0.12) 0%, rgba(45,95,196,0.04) 100%)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Add your past season to your profile</p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#8892aa' }}>
            You&apos;ve got stats that aren&apos;t showing to coaches yet — <span style={{ color: '#e8dece', fontWeight: 600 }}>{line}</span>
            {legacy.club_name ? <> at {legacy.club_name}</> : null}. Which season was this?
          </p>
        </div>
        <button type="button" onClick={() => setDismissed(true)} className="flex-shrink-0" style={{ color: '#8892aa' }} aria-label="Dismiss">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="flex gap-2">
        <select value={year} onChange={e => setYear(e.target.value ? parseInt(e.target.value, 10) : '')}
          className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer"
          style={{ backgroundColor: '#0d1020', border: '1px solid #1e2235', color: '#e8dece' }}>
          <option value="">Select season…</option>
          {years.map(y => <option key={y} value={y}>{seasonLabel(y)}</option>)}
        </select>
        <button type="button" onClick={place} disabled={year === '' || busy}
          className="px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap"
          style={{ backgroundColor: year === '' || busy ? '#1e2a4a' : '#2d5fc4', color: '#fff', cursor: year === '' || busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Saving…' : 'Add to profile'}
        </button>
      </div>

      {error && <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>}
    </div>
  )
}
