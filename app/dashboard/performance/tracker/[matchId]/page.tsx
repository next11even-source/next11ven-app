'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Breadcrumb from '@/app/components/Breadcrumb'
import MatchForm, { type MatchFormValues, type NewStintValues } from '../../_components/MatchForm'
import RatingTrendChart from '../../_components/RatingTrendChart'
import { statAccent } from '../../_components/statAccents'
import {
  COMPETITION_TYPE_LABELS,
  MATCH_TAG_LABELS,
  STINT_TYPE_LABELS,
  seasonOfMatch,
  seasonLabel,
  type ClubStint,
  type CompetitionType,
  type MatchTag,
  type PerformanceMatch,
} from '@/lib/performance'

type MatchWithStint = PerformanceMatch & {
  club_stints: { id: string; club_name: string; level: string | null; stint_type: string } | null
}

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }

function fmtDate(d: string) {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export default function MatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = use(params)
  const router = useRouter()

  const [match, setMatch] = useState<MatchWithStint | null>(null)
  const [readonly, setReadonly] = useState(false)
  const [seasonMatches, setSeasonMatches] = useState<PerformanceMatch[]>([])
  const [stints, setStints] = useState<ClubStint[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => {
    fetch(`/api/performance/matches/${matchId}`)
      .then(r => {
        if (r.status === 403) { router.push('/dashboard/performance/tracker'); return null }
        if (r.status === 404) { router.push('/dashboard/performance/tracker'); return null }
        return r.ok ? r.json() : null
      })
      .then(data => {
        if (!data?.match) { setLoading(false); return }
        const m = data.match as MatchWithStint
        setMatch(m)
        setReadonly(data.access === 'readonly')
        const season = seasonOfMatch(m.match_date)
        return Promise.all([
          fetch(`/api/performance/matches?season=${season}&limit=200`).then(r => (r.ok ? r.json() : null)),
          fetch('/api/performance/stints').then(r => (r.ok ? r.json() : null)),
        ]).then(([matchesData, stintsData]) => {
          setSeasonMatches((matchesData?.matches ?? []) as PerformanceMatch[])
          setStints((stintsData?.stints ?? []) as ClubStint[])
          setLoading(false)
        })
      })
      .catch(() => setLoading(false))
  }, [matchId, router])

  useEffect(() => { load() }, [load])

  async function handleEditSubmit(values: MatchFormValues, newStint: NewStintValues | null) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      let stintId = values.stint_id
      if (newStint) {
        const stintRes = await fetch('/api/performance/stints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            club_name: newStint.club_name,
            level: newStint.level,
            stint_type: newStint.stint_type,
            start_date: values.match_date,
            close_others: newStint.stint_type !== 'trial',
          }),
        })
        const stintData = await stintRes.json()
        if (!stintRes.ok) { setError(stintData.error ?? 'Could not save your new club'); setBusy(false); return }
        stintId = stintData.stint.id
      }

      const res = await fetch(`/api/performance/matches/${matchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, stint_id: stintId }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Could not update the match'); setBusy(false); return }
      setEditing(false)
      setBusy(false)
      load()
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/performance/matches/${matchId}`, { method: 'DELETE' })
      if (res.ok) { router.push('/dashboard/performance/tracker'); return }
      const data = await res.json()
      setError(data.error ?? 'Could not delete the match')
      setBusy(false)
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  const m = match
  const hasScore = m && m.goals_for != null && m.goals_against != null
  const outcome = hasScore
    ? m!.goals_for! > m!.goals_against! ? 'Win' : m!.goals_for! === m!.goals_against! ? 'Draw' : 'Loss'
    : null

  // Rating trend: every rated match of this season, oldest → newest
  const chartPoints = seasonMatches
    .filter(x => x.rating != null)
    .sort((a, b) => a.match_date.localeCompare(b.match_date))
    .map(x => ({
      id: x.id,
      label: new Date(`${x.match_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      rating: Number(x.rating),
    }))
  const seasonAvg = chartPoints.length
    ? Math.round((chartPoints.reduce((n, p) => n + p.rating, 0) / chartPoints.length) * 10) / 10
    : null

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="px-4 pt-3 pb-3" style={{ borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[
          { label: 'Home', href: '/dashboard/player' },
          { label: 'Game Performance Tracker', href: '/dashboard/performance/tracker' },
          { label: m ? `vs ${m.opponent}` : 'Match' },
        ]} />
      </div>

      <div className="px-4 pt-6 max-w-lg mx-auto space-y-5">
        {loading && (
          <div className="rounded-2xl p-8 text-center" style={surface}>
            <p className="text-sm" style={{ color: '#8892aa' }}>Loading match…</p>
          </div>
        )}

        {!loading && m && editing && (
          <>
            <h1 className="text-3xl font-black uppercase leading-tight"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Edit match
            </h1>
            <MatchForm
              initial={{
                match_date: m.match_date,
                opponent: m.opponent,
                competition_type: m.competition_type,
                competition_name: m.competition_name,
                stint_id: m.stint_id,
                goals_for: m.goals_for,
                goals_against: m.goals_against,
                started: m.started,
                position: m.position,
                minutes_played: m.minutes_played,
                goals: m.goals,
                assists: m.assists,
                penalty_saves: m.penalty_saves ?? 0,
                rating: m.rating != null ? Number(m.rating) : null,
                notes: m.notes,
                tags: m.tags,
              }}
              stints={stints}
              submitLabel="Save changes"
              busy={busy}
              error={error}
              onSubmit={handleEditSubmit}
              onCancel={() => { setEditing(false); setError(null) }}
            />
          </>
        )}

        {!loading && m && !editing && (
          <>
            {/* Header */}
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>
                {fmtDate(m.match_date)} · {COMPETITION_TYPE_LABELS[m.competition_type as CompetitionType] ?? m.competition_type}
                {m.competition_name ? ` · ${m.competition_name}` : ''}
              </p>
              <h1 className="text-3xl font-black uppercase leading-tight mt-1"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                vs {m.opponent}
              </h1>
              <p className="text-sm mt-1" style={{ color: '#8892aa' }}>
                {m.club_stints
                  ? <>{m.club_stints.club_name}
                      {m.club_stints.stint_type !== 'contracted' && ` (${STINT_TYPE_LABELS[m.club_stints.stint_type as keyof typeof STINT_TYPE_LABELS] ?? m.club_stints.stint_type})`}
                      {m.club_stints.level && ` · ${m.club_stints.level}`}</>
                  : 'Unattached'}
              </p>
            </div>

            {/* Result */}
            {hasScore && (
              <div className="rounded-2xl px-5 py-4 flex items-center justify-between" style={surface}>
                <p className="text-sm font-semibold" style={{ color: '#8892aa' }}>{outcome}</p>
                <p className="text-3xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                  {m.goals_for} – {m.goals_against}
                </p>
              </div>
            )}

            {/* Your numbers */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Goals', value: m.goals },
                { label: 'Assists', value: m.assists },
                { label: 'Minutes', value: m.minutes_played ?? '—' },
                { label: 'Rating', value: m.rating != null ? Number(m.rating).toFixed(1) : '—' },
              ].map(({ label, value }) => {
                const a = statAccent(label)
                return (
                  <div key={label} className="rounded-2xl px-2 py-3.5 text-center"
                    style={{ background: a.background, border: a.border }}>
                    <p className="text-2xl font-black leading-none"
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", color: a.fg }}>
                      {value}
                    </p>
                    <p className="mt-1.5 uppercase tracking-wider font-semibold" style={{ color: '#8892aa', fontSize: 10 }}>{label}</p>
                  </div>
                )
              })}
            </div>

            {/* Appearance detail */}
            <div className="rounded-2xl px-4 py-3 flex items-center gap-4" style={surface}>
              <p className="text-sm" style={{ color: '#8892aa' }}>
                <span style={{ color: '#e8dece', fontWeight: 600 }}>{m.started ? 'Started' : 'Subbed on'}</span>
                {m.position && <> · {m.position}</>}
                {(m.penalty_saves ?? 0) > 0 && (
                  <> · <span style={{ color: '#3a6fda', fontWeight: 600 }}>
                    {m.penalty_saves} penalt{m.penalty_saves === 1 ? 'y' : 'ies'} saved
                  </span></>
                )}
              </p>
            </div>

            {/* Rating trend */}
            {chartPoints.length >= 2 && (
              <div className="rounded-2xl px-3 pt-4 pb-2" style={surface}>
                <p className="text-xs uppercase tracking-wider font-semibold px-2 mb-2" style={{ color: '#8892aa' }}>
                  Rating trend · {seasonLabel(seasonOfMatch(m.match_date))}
                </p>
                <RatingTrendChart points={chartPoints} highlightId={m.id} seasonAvg={seasonAvg} />
              </div>
            )}

            {/* Tags */}
            {m.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {m.tags.map(t => (
                  <span key={t} className="px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#3a6fda', border: '1px solid rgba(45,95,196,0.35)' }}>
                    {MATCH_TAG_LABELS[t as MatchTag] ?? t}
                  </span>
                ))}
              </div>
            )}

            {/* Notes */}
            {m.notes && (
              <div className="rounded-2xl px-4 py-4" style={surface}>
                <p className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: '#8892aa' }}>Notes</p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#e8dece' }}>{m.notes}</p>
              </div>
            )}

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg"
                style={{ color: '#e8dece', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </p>
            )}

            {/* Actions — read-only players can look but not touch */}
            {readonly ? (
              <p className="text-xs text-center pt-1" style={{ color: '#8892aa' }}>
                Editing and logging are Premium —{' '}
                <Link href="/dashboard/player/premium" style={{ color: '#3a6fda', textDecoration: 'none', fontWeight: 600 }}>
                  unlock your tracker
                </Link>
              </p>
            ) : (
            <div className="space-y-2 pt-1">
              <button onClick={() => setEditing(true)}
                className="w-full py-3 rounded-2xl text-sm font-bold uppercase tracking-wider"
                style={{ backgroundColor: 'rgba(45,95,196,0.15)', border: '1px solid rgba(45,95,196,0.4)', color: '#3a6fda' }}>
                Edit match
              </button>
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)}
                  className="w-full py-2.5 text-sm" style={{ color: '#8892aa' }}>
                  Delete this match
                </button>
              ) : (
                <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  <p className="text-sm font-semibold text-center" style={{ color: '#e8dece' }}>
                    Delete this match for good?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDelete(false)} disabled={busy}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#8892aa' }}>
                      Keep it
                    </button>
                    <button onClick={handleDelete} disabled={busy}
                      className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                      style={{ backgroundColor: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
                      {busy ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
