'use client'

// Coach recruitment dashboard — facts-only, sortable/filterable performance.
// Every number here is the same allowlisted aggregate the player sees on their
// own profile; private notes and self-ratings never appear. No percentiles or
// rankings — raw facts, coach concludes.
//
// Career output is ALWAYS rendered split by level (careerByLevel), never as a
// blended total: a single "75 apps · 60G · 34A" line reads as senior output
// when it can be an academy season.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Breadcrumb from '@/app/components/Breadcrumb'
import { POSITIONS } from '@/lib/positions'
import { TRACKER_LEVELS } from '@/lib/levels'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }
const input = { backgroundColor: '#0d1020', border: '1px solid #1e2235', color: '#e8dece' } as const

type LevelTotals = { level: string | null; apps: number; goals: number; assists: number; minutes: number; seasons: number }

type Player = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  secondary_position: string | null
  level: string | null
  city: string | null
  actively_looking: boolean
  versatility: string[]
  pedigree: { peakLevel: string | null; academyBackground: boolean; stepsAbove: number }
  current: { apps: number; goals: number; assists: number; involvements: number; minutes: number; avgMinutes: number | null; cleanSheets: number; motm: number } | null
  rates: { per90Goals: number | null; per90Involvements: number | null; perGameInvolvements: number | null } | null
  form: ('W' | 'D' | 'L')[]
  discipline: { yellowCards: number; redCards: number }
  career: { apps: number; goals: number; assists: number; minutes: number }
  careerByLevel: LevelTotals[]
}

const SORTS: { key: string; label: string }[] = [
  { key: 'involvements', label: 'Goal involvements' },
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'per90Goals', label: 'Goals / 90' },
  { key: 'perGameInvolvements', label: 'G+A / game' },
  { key: 'apps', label: 'Appearances' },
  { key: 'minutes', label: 'Minutes' },
]

function FormPills({ results }: { results: ('W' | 'D' | 'L')[] }) {
  const ordered = [...results].reverse()
  return (
    <div className="flex gap-1">
      {ordered.map((r, i) => (
        <span key={i} className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black"
          style={r === 'W' ? { backgroundColor: '#2d5fc4', color: '#fff' }
            : r === 'D' ? { backgroundColor: '#1e2235', color: '#8892aa' }
              : { backgroundColor: '#0a0a0a', color: '#8892aa', border: '1px solid #1e2235' }}>
          {r}
        </span>
      ))}
    </div>
  )
}

function LockedState() {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(45,95,196,0.4)', background: 'linear-gradient(160deg, rgba(45,95,196,0.12) 0%, rgba(45,95,196,0.04) 100%)' }}>
      <div className="px-5 py-6">
        <h2 className="text-xl font-black uppercase leading-tight mb-2" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Recruit by the numbers
        </h2>
        <p className="text-sm leading-relaxed mb-4" style={{ color: '#8892aa' }}>
          Search players by real performance — goals, assists, minutes, form, and the level each figure was played at. Spot the players who&apos;ve competed above where they are now.
        </p>
        <Link href="/dashboard/coach/premium"
          className="block w-full text-center py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider"
          style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
          Unlock with Coach Pro · £9.99/mo
        </Link>
      </div>
    </div>
  )
}

// Career output, split by the level it was achieved at. Highest level first.
function CareerByLevel({ rows }: { rows: LevelTotals[] }) {
  if (rows.length === 0) return null
  const shown = rows.slice(0, 3)
  return (
    <div className="mt-3 space-y-1.5">
      {shown.map((r, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold flex-shrink-0"
            style={{ backgroundColor: '#0d1020', color: '#8892aa', border: '1px solid #1e2235' }}>
            {r.level ?? 'Level not set'}
          </span>
          <span className="text-xs" style={{ color: '#e8dece' }}>
            {r.apps} apps · {r.goals}G · {r.assists}A
          </span>
        </div>
      ))}
      {rows.length > shown.length && (
        <p className="text-[11px]" style={{ color: '#8892aa' }}>
          +{rows.length - shown.length} more level{rows.length - shown.length > 1 ? 's' : ''}
        </p>
      )}
      <p className="text-[11px]" style={{ color: '#8892aa' }}>Self-reported career history</p>
    </div>
  )
}

export default function CoachPerformancePage() {
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [locked, setLocked] = useState(false)
  const [position, setPosition] = useState('')
  const [level, setLevel] = useState('')
  const [sort, setSort] = useState('involvements')
  const [minApps, setMinApps] = useState('')
  const [scope, setScope] = useState<'career' | 'season'>('career')
  const [availableOnly, setAvailableOnly] = useState(false)
  // Server decides whether current-season figures are shown at all (see
  // SEASON_STATS_VISIBLE in the route). Until enough players log games, the
  // season fields come back empty and the scope toggle stays hidden.
  const [seasonStatsVisible, setSeasonStatsVisible] = useState(false)

  const load = useCallback(() => {
    const qs = new URLSearchParams()
    if (position) qs.set('position', position)
    if (level) qs.set('level', level)
    if (sort) qs.set('sort', sort)
    if (minApps) qs.set('minApps', minApps)
    qs.set('scope', scope)
    if (availableOnly) qs.set('available', '1')
    fetch(`/api/coach/performance-search?${qs.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) { setPlayers([]); return }
        setLocked(!!data.locked)
        setSeasonStatsVisible(!!data.seasonStatsVisible)
        if (!data.seasonStatsVisible) setScope('career')
        setPlayers(data.players ?? [])
      })
      .catch(() => setPlayers([]))
  }, [position, level, sort, minApps, scope, availableOnly])

  useEffect(() => { load() }, [load])

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="px-4 pt-3 pb-3" style={{ borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[{ label: 'Home', href: '/dashboard/coach' }, { label: 'Player stats' }]} />
      </div>

      <div className="px-4 pt-6 max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-black uppercase leading-tight" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Player stats
          </h1>
          <p className="text-sm mt-1.5" style={{ color: '#8892aa' }}>
            Players ranked by their career record, split by the level they played it at. Tap a player to view their profile and reach out.
          </p>
        </div>

        {locked ? <LockedState /> : (
          <>
            {/* Scope — career history vs this season's logged games. Hidden
                while the server withholds season figures, so there's no toggle
                leading to a view that can only say "no games logged". */}
            {seasonStatsVisible && (
              <div className="rounded-2xl p-1 grid grid-cols-2 gap-1" style={surface}>
                {([['career', 'Career'], ['season', 'This season']] as const).map(([key, label]) => (
                  <button key={key} onClick={() => setScope(key)}
                    className="py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                    style={scope === key
                      ? { backgroundColor: '#2d5fc4', color: '#fff' }
                      : { backgroundColor: 'transparent', color: '#8892aa' }}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Filters */}
            <div className="rounded-2xl p-3 space-y-2" style={surface}>
              <div className="grid grid-cols-2 gap-2">
                <select value={position} onChange={e => setPosition(e.target.value)}
                  className="rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer" style={input}>
                  <option value="">Any position</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={level} onChange={e => setLevel(e.target.value)}
                  className="rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer" style={input}>
                  <option value="">Any level</option>
                  {TRACKER_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <select value={sort} onChange={e => setSort(e.target.value)}
                  className="rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer" style={input}>
                  {SORTS.map(s => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
                </select>
                <input type="number" min={0} max={400} inputMode="numeric" placeholder="Min apps"
                  value={minApps} onChange={e => setMinApps(e.target.value)}
                  className="rounded-xl px-3 py-2.5 text-sm outline-none" style={input} />
              </div>
              <button onClick={() => setAvailableOnly(v => !v)}
                className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                style={availableOnly
                  ? { backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }
                  : { backgroundColor: '#0d1020', color: '#8892aa', border: '1px solid #1e2235' }}>
                {availableOnly ? '✓ Actively looking only' : 'Actively looking only'}
              </button>
            </div>

            {players === null ? (
              <div className="rounded-2xl p-8 text-center" style={surface}>
                <p className="text-sm" style={{ color: '#8892aa' }}>Loading…</p>
              </div>
            ) : players.length === 0 ? (
              <div className="rounded-2xl p-8 text-center" style={surface}>
                <p className="text-sm" style={{ color: '#8892aa' }}>
                  {availableOnly
                    ? 'No players match those filters. Try turning off “Actively looking only” to see everyone tracking their stats.'
                    : 'No players match yet. As more players log games, they’ll show here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {players.map(p => (
                  <Link key={p.id} href={`/dashboard/player/players/${p.id}`}
                    className="block rounded-2xl p-4" style={{ ...surface, textDecoration: 'none' }}>
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235' }}>
                        {p.avatar_url
                          ? <Image src={p.avatar_url} alt="" width={44} height={44} className="w-full h-full object-cover" />
                          : <span className="text-sm font-black" style={{ color: '#8892aa' }}>{p.full_name?.[0]?.toUpperCase() ?? '?'}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{p.full_name ?? 'Player'}</p>
                          {p.level && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#3a6fda', border: '1px solid rgba(45,95,196,0.35)' }}>{p.level}</span>}
                          {p.actively_looking && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.35)' }}>
                              Actively looking
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                          {[p.position, p.secondary_position].filter(Boolean).join(' / ') || '—'}{p.city ? ` · ${p.city}` : ''}
                        </p>
                      </div>
                      {p.form.length > 0 && <FormPills results={p.form} />}
                    </div>

                    {/* Pedigree — has played above his current level */}
                    {p.pedigree.stepsAbove > 0 && p.pedigree.peakLevel && (
                      <div className="mt-3 px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 flex-wrap"
                        style={{ backgroundColor: 'rgba(232,222,206,0.06)', border: '1px solid rgba(232,222,206,0.2)' }}>
                        <span className="text-xs font-bold" style={{ color: '#e8dece' }}>↑ Played at {p.pedigree.peakLevel}</span>
                        <span className="text-[11px]" style={{ color: '#8892aa' }}>
                          · {p.pedigree.stepsAbove} level{p.pedigree.stepsAbove > 1 ? 's' : ''} above now
                        </span>
                      </div>
                    )}

                    {/* Facts — season figures when logged, level-split career otherwise */}
                    {scope === 'season' && p.current ? (
                      <div className="flex items-center gap-4 mt-3 flex-wrap">
                        <Fact label="Apps" value={p.current.apps} />
                        <Fact label="G" value={p.current.goals} />
                        <Fact label="A" value={p.current.assists} />
                        <Fact label="G+A" value={p.current.involvements} />
                        {p.rates?.per90Goals != null && <Fact label="G/90" value={p.rates.per90Goals.toFixed(2)} />}
                        {p.current.avgMinutes != null && <Fact label="Avg min" value={p.current.avgMinutes} />}
                        {p.current.cleanSheets > 0 && <Fact label="CS" value={p.current.cleanSheets} />}
                        {p.current.motm > 0 && <Fact label="MOTM" value={p.current.motm} />}
                      </div>
                    ) : scope === 'season' ? (
                      <p className="text-xs mt-3" style={{ color: '#8892aa' }}>No games logged this season yet.</p>
                    ) : (
                      <CareerByLevel rows={p.careerByLevel} />
                    )}
                  </Link>
                ))}
              </div>
            )}

            <p className="text-xs px-1 pt-2" style={{ color: '#8892aa' }}>
              Stats are self-reported by players and shown with their consent, split by the level they were played at.
              {scope === 'season' ? ' Figures are this season’s league & cup games.' : ' Career figures cover every season a player has recorded.'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-lg font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider" style={{ color: '#8892aa' }}>{label}</span>
    </div>
  )
}
