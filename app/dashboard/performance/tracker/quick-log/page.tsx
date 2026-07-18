'use client'

// Current-season quick-log — the stripped back-fill for a mid-season joiner:
// date + opponent + minutes + goals + assists, nothing else. Auto-attaches to
// the active club stint and defaults to league so several already-played games
// go in fast. Writes real performance_matches (current season). The full log
// form is one tap away for anything richer.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Breadcrumb from '@/app/components/Breadcrumb'
import { seasonStartYear, seasonLabel, type ClubStint } from '@/lib/performance'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }
const input = { backgroundColor: '#0d1020', border: '1px solid #1e2235', color: '#e8dece' } as const

function lastSaturday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7))
  return d.toISOString().slice(0, 10)
}

export default function QuickLogPage() {
  const router = useRouter()
  const season = seasonStartYear()

  const [ready, setReady] = useState(false)
  const [activeStint, setActiveStint] = useState<ClubStint | null>(null)
  const [defaultPosition, setDefaultPosition] = useState<string | null>(null)

  const [date, setDate] = useState(lastSaturday())
  const [opponent, setOpponent] = useState('')
  const [minutes, setMinutes] = useState('90')
  const [goals, setGoals] = useState('0')
  const [assists, setAssists] = useState('0')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addedCount, setAddedCount] = useState(0)

  useEffect(() => {
    fetch('/api/performance/summary')
      .then(r => {
        if (r.status === 403) { router.push('/dashboard/performance/tracker'); return null }
        return r.ok ? r.json() : null
      })
      .then(data => {
        if (!data) return
        if (data.access === 'readonly') { router.push('/dashboard/player/premium'); return }
        setActiveStint((data.activeStint as ClubStint | null) ?? null)
        setDefaultPosition(data.defaults?.position ?? null)
        if (data.defaults?.suggestedMatchDate) setDate(data.defaults.suggestedMatchDate)
        setReady(true)
      })
      .catch(() => setError('Could not load your tracker. Try again.'))
  }, [router])

  async function add() {
    if (busy) return
    if (!opponent.trim()) { setError('Add the opponent'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/performance/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_date: date,
          opponent: opponent.trim(),
          competition_type: 'league',
          competition_name: null,
          stint_id: activeStint?.id ?? null,
          goals_for: null,
          goals_against: null,
          started: true,
          position: defaultPosition,
          minutes_played: minutes === '' ? null : Math.min(120, Math.max(0, parseInt(minutes, 10) || 0)),
          goals: Math.max(0, parseInt(goals, 10) || 0),
          assists: Math.max(0, parseInt(assists, 10) || 0),
          penalty_saves: 0,
          yellow_cards: 0,
          red_card: false,
          rating: null,
          notes: null,
          tags: [],
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not log the match'); setBusy(false); return }
      // Reset for the next game — keep date/minutes, clear the rest.
      setOpponent(''); setGoals('0'); setAssists('0')
      setAddedCount(c => c + 1)
      setBusy(false)
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
          { label: 'Quick log' },
        ]} />
      </div>

      <div className="px-4 pt-6 max-w-lg mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-black uppercase leading-tight"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Quick log
          </h1>
          <p className="text-sm mt-1.5" style={{ color: '#8892aa' }}>
            Already played some {seasonLabel(season)} games? Add them fast — just the essentials.
            {activeStint ? <> Attached to <span style={{ color: '#e8dece', fontWeight: 600 }}>{activeStint.club_name}</span>.</> : null}
          </p>
        </div>

        {!ready ? (
          <div className="rounded-2xl p-8 text-center" style={surface}>
            <p className="text-sm" style={{ color: '#8892aa' }}>{error ?? 'Loading…'}</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl p-4 space-y-4" style={surface}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#8892aa' }}>Date</p>
                  <input type="date" value={date} max={new Date().toISOString().slice(0, 10)}
                    onChange={e => setDate(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ ...input, colorScheme: 'dark' }} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#8892aa' }}>Minutes</p>
                  <input type="number" min={0} max={120} inputMode="numeric" value={minutes}
                    onChange={e => setMinutes(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={input} />
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#8892aa' }}>Opponent</p>
                <input type="text" value={opponent} maxLength={60} placeholder="e.g. Hashtag United"
                  onChange={e => setOpponent(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={input} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#8892aa' }}>Goals</p>
                  <input type="number" min={0} max={30} inputMode="numeric" value={goals}
                    onChange={e => setGoals(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-center outline-none" style={input} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#8892aa' }}>Assists</p>
                  <input type="number" min={0} max={30} inputMode="numeric" value={assists}
                    onChange={e => setAssists(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-center outline-none" style={input} />
                </div>
              </div>
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg"
                style={{ color: '#e8dece', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </p>
            )}

            <button onClick={add} disabled={busy}
              className="w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider"
              style={{ backgroundColor: busy ? '#1e2a4a' : '#2d5fc4', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Adding…' : 'Add & log another'}
            </button>

            <div className="flex items-center justify-between">
              {addedCount > 0
                ? <p className="text-xs" style={{ color: '#3a6fda' }}>{addedCount} game{addedCount === 1 ? '' : 's'} added</p>
                : <span />}
              <Link href="/dashboard/performance/tracker" className="text-xs font-semibold"
                style={{ color: '#8892aa', textDecoration: 'none' }}>
                {addedCount > 0 ? 'Done →' : 'Cancel'}
              </Link>
            </div>

            <p className="text-xs text-center" style={{ color: '#8892aa' }}>
              Want to add a rating, cards or notes?{' '}
              <Link href="/dashboard/performance/tracker/log" style={{ color: '#3a6fda', textDecoration: 'none' }}>Use the full log</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
