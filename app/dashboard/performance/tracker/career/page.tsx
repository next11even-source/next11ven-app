'use client'

// Career editor — the pre-platform seed flow. Players add/edit/delete per-season
// summaries of the career they had before joining NEXT11VEN. These are flagged
// self-reported and only ever cover seasons the live log doesn't (the read-side
// anti-double-count rule keeps them from colliding with logged seasons).

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Breadcrumb from '@/app/components/Breadcrumb'
import { seasonLabel, seasonStartYear, type CareerStat } from '@/lib/performance'
import { LEVELS } from '@/lib/levels'
import { POSITIONS } from '@/lib/positions'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }
const input = { backgroundColor: '#0d1020', border: '1px solid #1e2235', color: '#e8dece' } as const

type FormState = {
  season_start_year: number | ''
  club_name: string
  level: string
  position: string
  apps: string
  goals: string
  assists: string
  minutes: string
  clean_sheets: string
}

const EMPTY_FORM: FormState = {
  season_start_year: '', club_name: '', level: '', position: '',
  apps: '', goals: '', assists: '', minutes: '', clean_sheets: '',
}

function rowToForm(r: CareerStat): FormState {
  return {
    season_start_year: r.season_start_year,
    club_name: r.club_name ?? '',
    level: r.level ?? '',
    position: r.position ?? '',
    apps: r.apps != null ? String(r.apps) : '',
    goals: r.goals != null ? String(r.goals) : '',
    assists: r.assists != null ? String(r.assists) : '',
    minutes: r.minutes != null ? String(r.minutes) : '',
    clean_sheets: r.clean_sheets != null ? String(r.clean_sheets) : '',
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#8892aa' }}>{label}</p>
      {children}
    </div>
  )
}

export default function CareerEditorPage() {
  const router = useRouter()
  const current = seasonStartYear()
  const years = Array.from({ length: 21 }, (_, i) => current - i)

  const [rows, setRows] = useState<CareerStat[] | null>(null)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/performance/career-stats')
      .then(r => {
        if (r.status === 403) { router.push('/dashboard/performance/tracker'); return null }
        return r.ok ? r.json() : null
      })
      .then(data => { if (data) setRows(data.career ?? []) })
      .catch(() => setRows([]))
  }, [router])

  useEffect(() => { load() }, [load])

  function startAdd() {
    setForm(EMPTY_FORM)
    setEditingId('new')
    setError(null)
  }
  function startEdit(r: CareerStat) {
    setForm(rowToForm(r))
    setEditingId(r.id)
    setError(null)
  }
  function cancel() {
    setEditingId(null)
    setError(null)
  }

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(prev => ({ ...prev, [k]: v }))
  const numOrNull = (s: string) => (s === '' ? null : Math.max(0, parseInt(s, 10) || 0))

  async function save() {
    if (busy) return
    if (form.season_start_year === '') { setError('Pick a season'); return }
    setBusy(true)
    setError(null)
    const payload = {
      season_start_year: form.season_start_year,
      club_name: form.club_name.trim() || null,
      level: form.level || null,
      position: form.position || null,
      apps: numOrNull(form.apps),
      goals: numOrNull(form.goals),
      assists: numOrNull(form.assists),
      minutes: numOrNull(form.minutes),
      clean_sheets: numOrNull(form.clean_sheets),
    }
    try {
      const isNew = editingId === 'new'
      const res = await fetch(isNew ? '/api/performance/career-stats' : `/api/performance/career-stats/${editingId}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not save'); setBusy(false); return }
      setBusy(false)
      setEditingId(null)
      load()
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/performance/career-stats/${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Could not delete'); setBusy(false); return }
      setBusy(false)
      setConfirmDelete(null)
      load()
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
          { label: 'Career history' },
        ]} />
      </div>

      <div className="px-4 pt-6 max-w-lg mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-black uppercase leading-tight"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Career history
          </h1>
          <p className="text-sm mt-1.5" style={{ color: '#8892aa' }}>
            Add the seasons you played before you started logging here — so a coach sees a full record, not a blank one. Shown as self-reported.
          </p>
        </div>

        {rows === null ? (
          <div className="rounded-2xl p-8 text-center" style={surface}>
            <p className="text-sm" style={{ color: '#8892aa' }}>Loading…</p>
          </div>
        ) : (
          <>
            {/* Existing rows */}
            {rows.map(r => (
              <div key={r.id} className="rounded-2xl p-4" style={surface}>
                {editingId === r.id ? (
                  <CareerForm form={form} setF={setF} years={years} busy={busy} error={error}
                    onSave={save} onCancel={cancel} submitLabel="Save changes" />
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{seasonLabel(r.season_start_year)}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: '#8892aa' }}>
                        {[r.club_name, r.level, r.position].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <p className="text-xs mt-1" style={{ color: '#8892aa' }}>
                        {r.apps ?? 0} apps · {r.goals ?? 0}G · {r.assists ?? 0}A
                        {r.clean_sheets != null && r.clean_sheets > 0 ? ` · ${r.clean_sheets}CS` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => startEdit(r)} className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#3a6fda', border: '1px solid rgba(45,95,196,0.35)' }}>
                        Edit
                      </button>
                      {confirmDelete === r.id ? (
                        <button onClick={() => remove(r.id)} disabled={busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                          style={{ backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)' }}>
                          {busy ? '…' : 'Confirm'}
                        </button>
                      ) : (
                        <button onClick={() => setConfirmDelete(r.id)} className="text-xs px-3 py-1.5" style={{ color: '#8892aa' }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add form / button */}
            {editingId === 'new' ? (
              <div className="rounded-2xl p-4" style={surface}>
                <CareerForm form={form} setF={setF} years={years} busy={busy} error={error}
                  onSave={save} onCancel={cancel} submitLabel="Add season" />
              </div>
            ) : editingId === null ? (
              <button onClick={startAdd}
                className="w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2"
                style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add a season
              </button>
            ) : null}

            {rows.length === 0 && editingId === null && (
              <p className="text-xs text-center" style={{ color: '#8892aa' }}>No career seasons yet.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CareerForm({
  form, setF, years, busy, error, onSave, onCancel, submitLabel,
}: {
  form: FormState
  setF: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  years: number[]
  busy: boolean
  error: string | null
  onSave: () => void
  onCancel: () => void
  submitLabel: string
}) {
  return (
    <div className="space-y-3">
      <Field label="Season">
        <select value={form.season_start_year}
          onChange={e => setF('season_start_year', e.target.value ? parseInt(e.target.value, 10) : '')}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer" style={input}>
          <option value="">Select season…</option>
          {years.map(y => <option key={y} value={y}>{seasonLabel(y)}</option>)}
        </select>
      </Field>

      <Field label="Club">
        <input type="text" value={form.club_name} maxLength={60} placeholder="Club name"
          onChange={e => setF('club_name', e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={input} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Level">
          <select value={form.level} onChange={e => setF('level', e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer" style={input}>
            <option value="">Select…</option>
            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Position">
          <select value={form.position} onChange={e => setF('position', e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer" style={input}>
            <option value="">Select…</option>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {([['apps', 'Apps'], ['goals', 'Goals'], ['assists', 'Assists']] as const).map(([k, label]) => (
          <Field key={k} label={label}>
            <input type="number" min={0} max={150} inputMode="numeric" placeholder="—"
              value={form[k]} onChange={e => setF(k, e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-center outline-none" style={input} />
          </Field>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Minutes (optional)">
          <input type="number" min={0} inputMode="numeric" placeholder="—"
            value={form.minutes} onChange={e => setF('minutes', e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm text-center outline-none" style={input} />
        </Field>
        <Field label="Clean sheets (optional)">
          <input type="number" min={0} max={150} inputMode="numeric" placeholder="—"
            value={form.clean_sheets} onChange={e => setF('clean_sheets', e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm text-center outline-none" style={input} />
        </Field>
      </div>

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg"
          style={{ color: '#e8dece', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onSave} disabled={busy}
          className="flex-1 py-3 rounded-2xl text-sm font-bold uppercase tracking-wider"
          style={{ backgroundColor: busy ? '#1e2a4a' : '#2d5fc4', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button onClick={onCancel} className="px-4 py-3 text-sm" style={{ color: '#8892aa' }}>Cancel</button>
      </div>
    </div>
  )
}
