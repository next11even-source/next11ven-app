'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Weekend "log your game" prompt. Shows Sat–Mon to players who can actually log
// (not read-only / locked), and deep-links straight to the log form so the CTA
// lands right when it's relevant. Dismissible for the current weekend so it
// never nags — the dismissal is keyed to that weekend's Saturday date.

function weekendKey(now: Date): string | null {
  const dow = now.getDay() // 0 Sun … 6 Sat
  if (dow !== 6 && dow !== 0 && dow !== 1) return null // Sat, Sun, Mon only
  const back = dow === 0 ? 1 : dow === 1 ? 2 : 0 // days back to this weekend's Saturday
  const sat = new Date(now)
  sat.setDate(sat.getDate() - back)
  return `weekendLogDismissed:${sat.toISOString().slice(0, 10)}`
}

export default function WeekendLogBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const key = weekendKey(new Date())
    if (!key) return
    if (localStorage.getItem(key) === '1') return

    // Only surface to players who can log (read-only / locked can't act on it).
    fetch('/api/performance/summary')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data || data.access === 'readonly') return
        setShow(true)
      })
      .catch(() => {})
  }, [])

  if (!show) return null

  const dismiss = () => {
    const key = weekendKey(new Date())
    if (key) localStorage.setItem(key, '1')
    setShow(false)
  }

  return (
    <div className="mx-4 mb-4 rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{ background: 'linear-gradient(135deg, rgba(56,189,248,0.14) 0%, rgba(45,95,196,0.06) 100%)', border: '1px solid rgba(56,189,248,0.4)' }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(56,189,248,0.14)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Played this weekend?</p>
        <p className="text-xs" style={{ color: '#8892aa' }}>Log it while it&apos;s fresh — it builds your season record.</p>
      </div>
      <Link href="/dashboard/performance/tracker/log"
        className="flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider"
        style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
        Log
      </Link>
      <button onClick={dismiss} className="flex-shrink-0 p-1" aria-label="Dismiss" style={{ color: '#8892aa' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
