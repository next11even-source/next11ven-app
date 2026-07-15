'use client'

import { useState } from 'react'

// Player-facing switch for folding pre-season/friendly matches into the
// headline stats. Only rendered once the player has logged at least one
// non-competitive match (see `preseasonLogged` in the summary response) —
// no point showing a toggle with nothing to include yet.
export default function PreseasonToggle({
  included,
  onChange,
}: {
  included: boolean
  onChange: (next: boolean) => void
}) {
  const [saving, setSaving] = useState(false)

  async function toggle() {
    if (saving) return
    const next = !included
    setSaving(true)
    try {
      const res = await fetch('/api/performance/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_preseason: next }),
      })
      if (res.ok) onChange(next)
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      className="flex items-center justify-between w-full rounded-2xl px-4 py-3.5 text-left"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', opacity: saving ? 0.6 : 1 }}
    >
      <span className="text-sm font-semibold pr-3" style={{ color: '#e8dece' }}>
        Include pre-season &amp; friendlies in stats
      </span>
      <span
        className="relative flex-shrink-0 rounded-full transition-colors"
        style={{ width: 40, height: 22, backgroundColor: included ? '#2d5fc4' : '#1e2235', border: '1px solid #1e2235' }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-transform"
          style={{ width: 18, height: 18, left: 2, backgroundColor: '#e8dece', transform: included ? 'translateX(18px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  )
}
