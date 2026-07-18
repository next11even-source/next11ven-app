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
      className="flex items-center justify-center gap-2 w-full px-3 py-1.5 text-left"
      style={{ opacity: saving ? 0.6 : 1 }}
    >
      <span className="text-xs font-medium" style={{ color: '#8892aa' }}>
        Include pre-season &amp; friendlies
      </span>
      <span
        className="relative flex-shrink-0 rounded-full transition-colors"
        style={{ width: 32, height: 18, backgroundColor: included ? '#2d5fc4' : '#1e2235', border: '1px solid #1e2235' }}
      >
        <span
          className="absolute top-0.5 rounded-full transition-transform"
          style={{ width: 14, height: 14, left: 2, backgroundColor: '#e8dece', transform: included ? 'translateX(14px)' : 'translateX(0)' }}
        />
      </span>
    </button>
  )
}
