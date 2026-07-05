'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Breadcrumb from '@/app/components/Breadcrumb'
import { seasonLabel, seasonStartYear } from '@/lib/performance'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }
const input = { backgroundColor: '#0d1020', border: '1px solid #1e2235', color: '#e8dece' } as const

type Field = { key: 'apps_target' | 'goals_target' | 'assists_target'; label: string; hint: string }

const FIELDS: Field[] = [
  { key: 'apps_target', label: 'Appearances', hint: 'League + cup games' },
  { key: 'goals_target', label: 'Goals', hint: 'Leave blank to skip' },
  { key: 'assists_target', label: 'Assists', hint: 'Leave blank to skip' },
]

export default function SeasonTargetPage() {
  const router = useRouter()
  const season = seasonStartYear()

  const [values, setValues] = useState<Record<Field['key'], string>>({
    apps_target: '', goals_target: '', assists_target: '',
  })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/performance/target?season=${season}`)
      .then(r => {
        if (r.status === 403) { router.push('/dashboard/performance/tracker'); return null }
        return r.ok ? r.json() : null
      })
      .then(data => {
        if (data?.target) {
          setValues({
            apps_target: data.target.apps_target != null ? String(data.target.apps_target) : '',
            goals_target: data.target.goals_target != null ? String(data.target.goals_target) : '',
            assists_target: data.target.assists_target != null ? String(data.target.assists_target) : '',
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [season, router])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const parsedValues = {
      apps_target: values.apps_target === '' ? null : parseInt(values.apps_target, 10),
      goals_target: values.goals_target === '' ? null : parseInt(values.goals_target, 10),
      assists_target: values.assists_target === '' ? null : parseInt(values.assists_target, 10),
    }
    if (parsedValues.apps_target == null && parsedValues.goals_target == null && parsedValues.assists_target == null) {
      setError('Set at least one target')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/performance/target', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season_start_year: season, ...parsedValues }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not save your target'); setBusy(false); return }
      router.push('/dashboard/performance/tracker')
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
          { label: 'Season target' },
        ]} />
      </div>

      <div className="px-4 pt-6 max-w-lg mx-auto space-y-5">
        <div>
          <h1 className="text-3xl font-black uppercase leading-tight"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Season target
          </h1>
          <p className="text-sm mt-1.5" style={{ color: '#8892aa' }}>
            What are you going after in {seasonLabel(season)}? You&apos;ll see live progress on your tracker as the games get logged.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl p-8 text-center" style={surface}>
            <p className="text-sm" style={{ color: '#8892aa' }}>Loading…</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-5">
            <div className="rounded-2xl p-4 space-y-4" style={surface}>
              {FIELDS.map(f => (
                <div key={f.key} className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>{f.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{f.hint}</p>
                  </div>
                  <input type="number" min={0} max={199} inputMode="numeric" placeholder="—"
                    value={values[f.key]}
                    onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-20 rounded-xl px-3 py-2.5 text-sm text-center outline-none"
                    style={input} />
                </div>
              ))}
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg"
                style={{ color: '#e8dece', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </p>
            )}

            <div className="space-y-2">
              <button type="submit" disabled={busy}
                className="w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider"
                style={{ backgroundColor: busy ? '#1e2a4a' : '#2d5fc4', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer' }}>
                {busy ? 'Saving…' : 'Save target'}
              </button>
              <button type="button" onClick={() => router.push('/dashboard/performance/tracker')}
                className="w-full py-2 text-sm" style={{ color: '#8892aa' }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
