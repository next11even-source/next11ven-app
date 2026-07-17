'use client'

import { useState } from 'react'
import { POSITIONS } from '@/lib/positions'
import { LEVELS } from '@/lib/levels'
import {
  COMPETITION_TYPES,
  COMPETITION_TYPE_LABELS,
  MATCH_TAGS,
  MATCH_TAG_LABELS,
  STINT_TYPES,
  STINT_TYPE_LABELS,
  type ClubStint,
  type CompetitionType,
  type StintType,
} from '@/lib/performance'

const surface = { backgroundColor: '#13172a', border: '1px solid #1e2235' }
const input = {
  backgroundColor: '#0d1020',
  border: '1px solid #1e2235',
  color: '#e8dece',
} as const

export type MatchFormValues = {
  match_date: string
  opponent: string
  competition_type: CompetitionType
  competition_name: string | null
  stint_id: string | null
  goals_for: number | null
  goals_against: number | null
  started: boolean
  position: string | null
  minutes_played: number | null
  goals: number
  assists: number
  penalty_saves: number
  yellow_cards: number
  red_card: boolean
  rating: number | null
  notes: string | null
  tags: string[]
}

export type NewStintValues = {
  club_name: string
  level: string | null
  stint_type: StintType
}

type Props = {
  initial: MatchFormValues
  stints: ClubStint[]
  submitLabel: string
  busy: boolean
  error: string | null
  /** newStint is set when the player chose "New club" — create it first, then
      attach the match to it. */
  onSubmit: (values: MatchFormValues, newStint: NewStintValues | null) => void
  onCancel?: () => void
}

const NEW_STINT = '__new__'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#8892aa' }}>
      {children}
    </p>
  )
}

// ── Delineation pills — where each field ends up, shown at the point of entry.
// Objective fields (goals, minutes, cards, MOTM…) are on the profile coaches
// see; rating, notes and the private tags stay yours. Not a consent wall — a
// small honest indicator next to the field.
function PublicPill() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#3a6fda', border: '1px solid rgba(45,95,196,0.35)' }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
      </svg>
      On profile
    </span>
  )
}
function PrivatePill() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: 'rgba(136,146,170,0.12)', color: '#8892aa', border: '1px solid #1e2235' }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Private
    </span>
  )
}

// Man of the match is a real public stat, surfaced separately from the private
// tag chips so the delineation stays honest.
const OTHER_TAGS = MATCH_TAGS.filter(t => t !== 'man_of_the_match')

function Stepper({ value, onChange, max = 30 }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(0, value - 1))}
        className="w-9 h-9 rounded-xl text-lg font-bold flex items-center justify-center"
        style={{ ...input, color: '#8892aa' }}>−</button>
      <span className="text-xl font-black w-8 text-center" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
        {value}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))}
        className="w-9 h-9 rounded-xl text-lg font-bold flex items-center justify-center"
        style={{ backgroundColor: 'rgba(45,95,196,0.15)', border: '1px solid rgba(45,95,196,0.4)', color: '#2d5fc4' }}>+</button>
    </div>
  )
}

export default function MatchForm({ initial, stints, submitLabel, busy, error, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<MatchFormValues>(initial)
  const [stintChoice, setStintChoice] = useState<string>(initial.stint_id ?? '')
  const [newStint, setNewStint] = useState<NewStintValues>({ club_name: '', level: null, stint_type: 'contracted' })
  const [localError, setLocalError] = useState<string | null>(null)
  // Discipline lives in an optional "add more" section so the core log stays
  // ~20 seconds. Auto-open when editing a match that already has a card.
  const [showMore, setShowMore] = useState<boolean>((initial.yellow_cards ?? 0) > 0 || initial.red_card)

  const set = <K extends keyof MatchFormValues>(key: K, val: MatchFormValues[K]) =>
    setV(prev => ({ ...prev, [key]: val }))

  function toggleTag(tag: string) {
    set('tags', v.tags.includes(tag) ? v.tags.filter(t => t !== tag) : [...v.tags, tag])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    if (!v.opponent.trim()) { setLocalError('Add the opponent name'); return }
    if (stintChoice === NEW_STINT && !newStint.club_name.trim()) { setLocalError('Add the club name for your new club'); return }
    onSubmit(
      { ...v, opponent: v.opponent.trim(), stint_id: stintChoice && stintChoice !== NEW_STINT ? stintChoice : null },
      stintChoice === NEW_STINT ? { ...newStint, club_name: newStint.club_name.trim() } : null,
    )
  }

  const ongoingStints = stints.filter(s => !s.end_date)
  const endedStints = stints.filter(s => s.end_date)

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Date + opponent */}
      <div className="rounded-2xl p-4 space-y-4" style={surface}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Date</Label>
            <input type="date" value={v.match_date} required
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => set('match_date', e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ ...input, colorScheme: 'dark' }} />
          </div>
          <div>
            <Label>Opponent</Label>
            <input type="text" value={v.opponent} placeholder="e.g. Hashtag United" maxLength={60}
              onChange={e => set('opponent', e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={input} />
          </div>
        </div>

        {/* Game type */}
        <div>
          <Label>Game type</Label>
          <div className="flex flex-wrap gap-2">
            {COMPETITION_TYPES.map(t => {
              const active = v.competition_type === t
              return (
                <button key={t} type="button" onClick={() => set('competition_type', t)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                  style={active
                    ? { backgroundColor: '#2d5fc4', color: '#fff', border: '1px solid #2d5fc4' }
                    : { ...input, color: '#8892aa' }}>
                  {COMPETITION_TYPE_LABELS[t]}
                </button>
              )
            })}
          </div>
          {(v.competition_type === 'cup' || v.competition_type === 'other') && (
            <input type="text" value={v.competition_name ?? ''} placeholder="Competition name (optional, e.g. FA Vase)"
              maxLength={60}
              onChange={e => set('competition_name', e.target.value || null)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mt-2"
              style={input} />
          )}
        </div>

        {/* Score */}
        <div>
          <Label>Score (optional)</Label>
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2">
              <input type="number" min={0} max={99} inputMode="numeric" placeholder="–"
                value={v.goals_for ?? ''}
                onChange={e => set('goals_for', e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-center outline-none"
                style={input} />
              <span className="text-xs whitespace-nowrap" style={{ color: '#8892aa' }}>us</span>
            </div>
            <span className="text-sm font-bold" style={{ color: '#8892aa' }}>:</span>
            <div className="flex-1 flex items-center gap-2">
              <input type="number" min={0} max={99} inputMode="numeric" placeholder="–"
                value={v.goals_against ?? ''}
                onChange={e => set('goals_against', e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full rounded-xl px-3 py-2.5 text-sm text-center outline-none"
                style={input} />
              <span className="text-xs whitespace-nowrap" style={{ color: '#8892aa' }}>them</span>
            </div>
          </div>
        </div>
      </div>

      {/* Your game */}
      <div className="rounded-2xl p-4 space-y-4" style={surface}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Started or sub?</Label>
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
              {([['Started', true], ['Sub', false]] as const).map(([label, val]) => (
                <button key={label} type="button" onClick={() => set('started', val)}
                  className="flex-1 py-2.5 text-xs font-bold"
                  style={v.started === val
                    ? { backgroundColor: '#2d5fc4', color: '#fff' }
                    : { backgroundColor: '#0d1020', color: '#8892aa' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Minutes</Label>
            <input type="number" min={0} max={120} inputMode="numeric"
              value={v.minutes_played ?? ''}
              onChange={e => set('minutes_played', e.target.value === '' ? null : Math.min(120, Math.max(0, parseInt(e.target.value, 10) || 0)))}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={input} />
          </div>
        </div>

        <div>
          <Label>Position played</Label>
          <select value={v.position ?? ''} onChange={e => set('position', e.target.value || null)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer"
            style={input}>
            <option value="">Select position…</option>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Goals</Label>
            <Stepper value={v.goals} onChange={n => set('goals', n)} />
          </div>
          <div>
            <Label>Assists</Label>
            <Stepper value={v.assists} onChange={n => set('assists', n)} />
          </div>
        </div>

        {/* Penalty saves — goalkeepers only */}
        {v.position === 'GK' && (
          <div>
            <Label>Penalty saves</Label>
            <Stepper value={v.penalty_saves} onChange={n => set('penalty_saves', n)} max={5} />
          </div>
        )}

        {/* Rating */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs uppercase tracking-wider font-semibold flex items-center gap-2" style={{ color: '#8892aa' }}>
              Your rating <PrivatePill />
            </p>
            {v.rating != null && (
              <button type="button" onClick={() => set('rating', null)} className="text-xs" style={{ color: '#8892aa' }}>
                Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <input type="range" min={1} max={10} step={0.5}
              value={v.rating ?? 6}
              onChange={e => set('rating', parseFloat(e.target.value))}
              className="flex-1"
              style={{ accentColor: '#2d5fc4' }} />
            {/* Always-visible readout: dim preview until the slider is touched */}
            <span className="text-2xl font-black w-12 text-right"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: v.rating != null ? '#2d5fc4' : '#3a4060' }}>
              {(v.rating ?? 6).toFixed(1)}
            </span>
          </div>
          {v.rating == null && (
            <p className="text-xs mt-1" style={{ color: '#8892aa' }}>Drag to set your rating — left blank until you do</p>
          )}
        </div>
      </div>

      {/* Club */}
      <div className="rounded-2xl p-4 space-y-3" style={surface}>
        <Label>Playing for</Label>
        <select value={stintChoice} onChange={e => setStintChoice(e.target.value)}
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer"
          style={input}>
          {ongoingStints.map(s => (
            <option key={s.id} value={s.id}>
              {s.club_name}{s.stint_type !== 'contracted' ? ` (${STINT_TYPE_LABELS[s.stint_type]})` : ''}
            </option>
          ))}
          <option value="">No club — unattached</option>
          <option value={NEW_STINT}>New club…</option>
          {endedStints.length > 0 && (
            <optgroup label="Previous clubs">
              {endedStints.map(s => (
                <option key={s.id} value={s.id}>{s.club_name}</option>
              ))}
            </optgroup>
          )}
        </select>

        {stintChoice === NEW_STINT && (
          <div className="space-y-3 rounded-xl p-3" style={{ backgroundColor: '#0d1020', border: '1px solid #1e2235' }}>
            <input type="text" value={newStint.club_name} placeholder="Club name" maxLength={60}
              onChange={e => setNewStint(prev => ({ ...prev, club_name: e.target.value }))}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ ...input, backgroundColor: '#13172a' }} />
            <div className="grid grid-cols-2 gap-3">
              <select value={newStint.level ?? ''}
                onChange={e => setNewStint(prev => ({ ...prev, level: e.target.value || null }))}
                className="rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer"
                style={{ ...input, backgroundColor: '#13172a' }}>
                <option value="">Level…</option>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={newStint.stint_type}
                onChange={e => setNewStint(prev => ({ ...prev, stint_type: e.target.value as StintType }))}
                className="rounded-xl px-3 py-2.5 text-sm outline-none appearance-none cursor-pointer"
                style={{ ...input, backgroundColor: '#13172a' }}>
                {STINT_TYPES.map(t => <option key={t} value={t}>{STINT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>
              {newStint.stint_type === 'trial'
                ? 'Trial games are kept separate from your club stat lines.'
                : 'This becomes your current club — your previous stint is closed off from this date.'}
            </p>
          </div>
        )}
      </div>

      {/* Man of the match — a real public stat, on its own so the delineation
          stays honest (the rest of the tags below are private). */}
      <div className="rounded-2xl p-4" style={surface}>
        <button type="button" onClick={() => toggleTag('man_of_the_match')}
          className="w-full flex items-center justify-between gap-3">
          <div className="text-left">
            <p className="text-sm font-bold flex items-center gap-2" style={{ color: '#e8dece' }}>
              Man of the match <PublicPill />
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>Tap if you won it — shows on your profile</p>
          </div>
          <span className="relative flex-shrink-0 w-12 h-7 rounded-full transition-colors"
            style={{
              backgroundColor: v.tags.includes('man_of_the_match') ? '#f59e0b' : '#0d1020',
              border: `1px solid ${v.tags.includes('man_of_the_match') ? '#f59e0b' : '#1e2235'}`,
            }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
              style={{ backgroundColor: '#fff', left: v.tags.includes('man_of_the_match') ? '22px' : '2px' }} />
          </span>
        </button>
      </div>

      {/* Add more — optional detail kept out of the core ~20s flow. Discipline
          lives here (public: suspensions matter to coaches). */}
      <div className="rounded-2xl overflow-hidden" style={surface}>
        <button type="button" onClick={() => setShowMore(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3.5">
          <span className="text-sm font-semibold" style={{ color: '#e8dece' }}>Add more detail</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showMore && (
          <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid #1e2235' }}>
            <div className="grid grid-cols-2 gap-3 pt-4">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-2" style={{ color: '#8892aa' }}>
                  Yellow cards <PublicPill />
                </p>
                <Stepper value={v.yellow_cards} onChange={n => set('yellow_cards', n)} max={2} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-2" style={{ color: '#8892aa' }}>
                  Red card <PublicPill />
                </p>
                <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
                  {([['No', false], ['Sent off', true]] as const).map(([label, val]) => (
                    <button key={label} type="button" onClick={() => set('red_card', val)}
                      className="flex-1 py-2.5 text-xs font-bold"
                      style={v.red_card === val
                        ? { backgroundColor: val ? 'rgba(239,68,68,0.2)' : '#2d5fc4', color: val ? '#ef4444' : '#fff' }
                        : { backgroundColor: '#0d1020', color: '#8892aa' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Private tags + notes — for the player's own record, never public. */}
      <div className="rounded-2xl p-4 space-y-4" style={surface}>
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-2" style={{ color: '#8892aa' }}>
            Tags <PrivatePill />
          </p>
          <div className="flex flex-wrap gap-2">
            {OTHER_TAGS.map(t => {
              const active = v.tags.includes(t)
              return (
                <button key={t} type="button" onClick={() => toggleTag(t)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-colors"
                  style={active
                    ? { backgroundColor: 'rgba(45,95,196,0.2)', color: '#3a6fda', border: '1px solid rgba(45,95,196,0.5)' }
                    : { ...input, color: '#8892aa' }}>
                  {MATCH_TAG_LABELS[t]}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold mb-1.5 flex items-center gap-2" style={{ color: '#8892aa' }}>
            Notes <PrivatePill />
          </p>
          <textarea value={v.notes ?? ''} rows={3} maxLength={2000}
            placeholder="Anything worth remembering — how you played, what to work on…"
            onChange={e => set('notes', e.target.value || null)}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
            style={input} />
        </div>
      </div>

      {(localError || error) && (
        <p className="text-xs px-3 py-2 rounded-lg"
          style={{ color: '#e8dece', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
          {localError || error}
        </p>
      )}

      <div className="space-y-2">
        <button type="submit" disabled={busy}
          className="w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider"
          style={{ backgroundColor: busy ? '#1e2a4a' : '#2d5fc4', color: '#fff', cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="w-full py-2 text-sm" style={{ color: '#8892aa' }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
