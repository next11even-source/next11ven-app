'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { toTitleCase } from '@/lib/utils'
import { needsLastName, normaliseNamePart, splitName } from '@/lib/name'
import Button from '@/components/ui/Button'

// Historic accounts stored a single `full_name`, so a user who typed only their
// first name at signup has no surname on file — they can't be addressed properly
// in campaigns and read as half-finished to a coach. Signup now collects the two
// parts separately and server-enforces both, so this only ever has to catch the
// accounts that predate that.
//
// Blocking by design: no backdrop dismiss, no Escape, no close control, and focus
// is trapped inside the panel so the page behind can't be reached by keyboard.
//
// Mounted ONCE, in app/dashboard/layout.tsx, so it covers every route under
// /dashboard — including /dashboard/profile, /showcase, /become and /admin, which
// have no shell of their own and were reachable by direct URL when this was
// mounted per-shell. Do not also mount it in PlayerShell or coach/layout: nested
// layouts compose, so that would stack two overlays.
//
// Self-fetching rather than prop-driven for the same reason — the dashboard root
// has no profile to hand it, and one small query per dashboard load is cheaper
// than threading a profile through every shell.

type NameProfile = {
  first_name: string | null
  last_name: string | null
  full_name: string | null
}

const FOCUSABLE = 'input, button, a[href], [tabindex]:not([tabindex="-1"])'

export default function SurnameGate() {
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<NameProfile | null>(null)

  // null means "the user hasn't touched this field", so the seed below still
  // applies once the profile arrives. Derived during render rather than pushed in
  // by an effect — profile loads async, so an effect here would set state on
  // arrival and cascade a second render for no reason.
  const [firstNameInput, setFirstNameInput] = useState<string | null>(null)
  const [lastName, setLastName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)

  const open = !!userId && !!profile && needsLastName(profile)

  // Seed from whichever side of the name the row actually has. first_name can be
  // absent on a row written before the split migration, hence the split fallback.
  const firstName =
    firstNameInput ??
    profile?.first_name ??
    splitName(profile?.full_name).firstName ??
    ''

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase
        .from('profiles')
        .select('full_name, first_name, last_name')
        .eq('id', user.id)
        .single()
        .then(({ data }) => setProfile(data))
    })
  }, [])

  // Hold the page still while the gate is up — the content behind it is not
  // reachable anyway, and a scrolling backdrop makes it look dismissible.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  // Focus trap. The overlay stops clicks, but without this Tab still walks into
  // the page behind and Enter activates it — which is the difference between
  // "hard to ignore" and "blocking".
  useEffect(() => {
    if (!open) return

    const items = () => {
      const panel = panelRef.current
      if (!panel) return [] as HTMLElement[]
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => !el.hasAttribute('disabled'))
    }

    function onKeyDown(e: KeyboardEvent) {
      // Escape is a no-op by default here, but swallow it so a parent handler
      // somewhere up the tree can't treat it as a dismiss.
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

    // Backstop for focus arriving by any route Tab-handling doesn't cover
    // (browser find-on-page, screen-reader navigation, an autofocus behind us).
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
    const first = normaliseNamePart(firstName)
    const last = normaliseNamePart(lastName)

    if (!first) { setError('Please enter your first name.'); return }
    // Letters, not length, is the real test — "Li" is a surname, "J" and "07"
    // are someone trying to get past the gate.
    if (!last || !/\p{L}/u.test(last)) { setError('Please enter your surname.'); return }
    if (last.length < 2) { setError('That surname looks too short — please enter it in full.'); return }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    // full_name is deliberately not written — trg_sync_profile_name derives it.
    const { error: saveError } = await supabase
      .from('profiles')
      .update({ first_name: first, last_name: last })
      .eq('id', userId!)

    if (saveError) {
      setSaving(false)
      setError('Could not save — please try again.')
      return
    }

    // Full reload rather than local state: the name is rendered by sidebars,
    // headers and cards that each hold their own copy from their own fetch, and
    // this happens once per account, ever. Not worth a cache-invalidation story.
    window.location.reload()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="surname-gate-title"
    >
      <div
        ref={panelRef}
        className="w-full max-w-md mx-4 rounded-t-2xl sm:rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
      >
        <h2
          id="surname-gate-title"
          className="text-lg font-black uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', letterSpacing: '0.04em' }}
        >
          Add your surname
        </h2>

        <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
          We only have one name on your account. Coaches searching for players expect
          a full name — add your surname to finish setting up your profile.
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs uppercase mb-1.5" style={{ color: '#8892aa', letterSpacing: '0.06em' }}>
              First name
            </span>
            <input
              value={firstName}
              onChange={e => setFirstNameInput(toTitleCase(e.target.value))}
              placeholder="First name"
              autoComplete="given-name"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none focus:border-[#2d5fc4]"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
            />
          </label>

          <label className="block">
            <span className="block text-xs uppercase mb-1.5" style={{ color: '#8892aa', letterSpacing: '0.06em' }}>
              Surname
            </span>
            <input
              value={lastName}
              onChange={e => setLastName(toTitleCase(e.target.value))}
              onKeyDown={e => { if (e.key === 'Enter' && !saving) handleSave() }}
              placeholder="Surname"
              autoComplete="family-name"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none focus:border-[#2d5fc4]"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
            />
          </label>
        </div>

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
