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
    <div className="rounded-2xl p-4" style={surface}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: '#e8dece' }}>
            {on ? 'Coaches can see your stats' : 'Your stats are hidden'}
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#8892aa' }}>
            {on
              ? 'Your objective stats — apps, goals, assists, minutes, positions, clubs, cards and Man of the Match — show on your profile. Your notes and self-ratings are always private.'
              : 'Your tracked stats are off your public profile. Coaches who view you won’t see them until you turn this back on.'}
          </p>
        </div>

        {/* Toggle — green only when ON (availability/positive signal, per brand) */}
        <button type="button" onClick={toggle} disabled={saving}
          aria-pressed={on}
          className="relative flex-shrink-0 w-12 h-7 rounded-full transition-colors"
          style={{
            backgroundColor: on ? '#22c55e' : '#1e2235',
            border: `1px solid ${on ? '#22c55e' : '#2a2f45'}`,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>
          <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
            style={{ backgroundColor: '#fff', left: on ? '22px' : '2px' }} />
        </button>
      </div>
    </div>
  )
}
