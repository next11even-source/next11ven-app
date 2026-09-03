'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Button from '@/components/ui/Button'

// Coaches who signed up before the coaching_role field was enforced have null
// stored. This gate intercepts them on their next login and forces a selection
// before they can use the dashboard.
//
// Blocking by design: no backdrop dismiss, no Escape, no close control, focus
// trapped inside the panel so the page behind is unreachable by keyboard.
//
// Mounted once in app/dashboard/layout.tsx alongside SurnameGate — same
// reasoning: covers every route under /dashboard including those with no shell.
// Do not also mount it in coach/layout or PlayerShell.
//
// Only fires for role === 'coach' with coaching_role === null. Admin/player
// roles are never shown this gate.

const COACHING_ROLES = [
  'Manager', 'Assistant Manager', 'First Team Coach', 'Coach', 'Goalkeeper Coach',
  'Scout', 'Director of Football', 'Other',
]

const FOCUSABLE = 'select, button, a[href], [tabindex]:not([tabindex="-1"])'

type GateProfile = {
  role: string | null
  coaching_role: string | null
}

export default function CoachingRoleGate() {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<GateProfile | null>(null)
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)

  const open = !!userId && !!profile && profile.role === 'coach' && !profile.coaching_role

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase
        .from('profiles')
        .select('role, coaching_role')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  // Lock scroll behind the overlay
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  // Focus trap — same pattern as SurnameGate
  useEffect(() => {
    if (!open) return

    const items = () => {
      const panel = panelRef.current
      if (!panel) return [] as HTMLElement[]
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => !el.hasAttribute('disabled'))
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return }
      if (e.key !== 'Tab') return

      const focusable = items()
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (!panelRef.current?.contains(active)) { e.preventDefault(); first.focus(); return }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
    }

    function onFocusIn(e: FocusEvent) {
      const panel = panelRef.current
      if (panel && !panel.contains(e.target as Node)) items()[0]?.focus()
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn, true)
    }
  }, [open])

  if (!open) return null

  async function handleSave() {
    if (!selected) { setError('Please select your role.'); return }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ coaching_role: selected })
      .eq('id', userId!)

    if (saveError) {
      setSaving(false)
      setError('Could not save — please try again.')
      return
    }

    window.location.reload()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="coaching-role-gate-title"
    >
      <div
        ref={panelRef}
        className="w-full max-w-md mx-4 rounded-t-2xl sm:rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
      >
        <h2
          id="coaching-role-gate-title"
          className="text-lg font-black uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', letterSpacing: '0.04em' }}
        >
          What is your role?
        </h2>

        <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
          Select your coaching role so players know who they are dealing with.
        </p>

        <label className="block">
          <span className="block text-xs uppercase mb-1.5" style={{ color: '#8892aa', letterSpacing: '0.06em' }}>
            Your role
          </span>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            autoFocus
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none focus:border-[#2d5fc4]"
            style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: selected ? '#e8dece' : '#8892aa' }}
          >
            <option value="" disabled>Select role...</option>
            {COACHING_ROLES.map(r => (
              <option key={r} value={r} style={{ color: '#e8dece' }}>{r}</option>
            ))}
          </select>
        </label>

        {error && (
          <p className="text-sm" style={{ color: '#f59e0b' }}>{error}</p>
        )}

        <Button
          variant="primary"
          size="md"
          onClick={handleSave}
          loading={saving}
          className="w-full"
        >
          Save and continue
        </Button>
      </div>
    </div>
  )
}
