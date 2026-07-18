'use client'

// Coarse "show my tracked stats on my profile" switch + the plain-English
// heads-up that goes with default-on visibility. Self-fetches current state.
// Objective-only exposure is stated explicitly so nobody is surprised.

import { useEffect, useState } from 'react'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }

export default function VisibilityControl() {
  const [value, setValue] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/player/performance-visibility')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setValue(!!d.performance_stats_public) })
      .catch(() => {})
  }, [])

  async function toggle() {
    if (value == null || saving) return
    const next = !value
    setSaving(true)
    setValue(next)  // optimistic
    try {
      const res = await fetch('/api/player/performance-visibility', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performance_stats_public: next }),
      })
      if (!res.ok) setValue(!next)  // revert on failure
    } catch {
      setValue(!next)
    } finally {
      setSaving(false)
    }
  }

  if (value == null) return null

  const on = value

  return (
    <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={surface}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={on ? '#22c55e' : '#8892aa'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
        {on
          ? <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>
          : <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>}
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-tight" style={{ color: '#e8dece' }}>
          {on ? 'Coaches can see your stats' : 'Your stats are hidden'}
        </p>
        <p className="text-xs leading-tight mt-0.5" style={{ color: '#8892aa' }}>
          Objective stats only — notes &amp; ratings stay private.
        </p>
      </div>

      {/* Toggle — green only when ON (availability/positive signal, per brand) */}
      <button type="button" onClick={toggle} disabled={saving}
        aria-pressed={on}
        className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors"
        style={{
          backgroundColor: on ? '#22c55e' : '#1e2235',
          border: `1px solid ${on ? '#22c55e' : '#2a2f45'}`,
          cursor: saving ? 'not-allowed' : 'pointer',
        }}>
        <span className="absolute top-0.5 w-4.5 h-4.5 rounded-full transition-all"
          style={{ backgroundColor: '#fff', width: 18, height: 18, left: on ? '20px' : '2px' }} />
      </button>
    </div>
  )
}
