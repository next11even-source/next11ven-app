'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { useSidebar } from '../_components/SidebarContext'

type Player = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  club: string | null
  city: string | null
  playing_level: string | null
  status: 'free_agent' | 'signed' | 'loan_dual_reg' | 'just_exploring' | null
  highlight_urls: string[] | null
  created_at: string
}

type QuickTab = 'all' | 'free_agents' | 'loan' | 'new'

const QUICK_TABS: { key: QuickTab; label: string; color: string }[] = [
  { key: 'all',        label: 'All Players',  color: '#2d5fc4' },
  { key: 'free_agents',label: 'Free Agents',  color: '#60a5fa' },
  { key: 'loan',       label: 'Loan / Dual',  color: '#a78bfa' },
  { key: 'new',        label: 'New Players',  color: '#f59e0b' },
]

type Filters = {
  position: string
  location: string
  status: string
  level: string
  hasHighlights: boolean
}

const EMPTY_FILTERS: Filters = { position: '', location: '', status: '', level: '', hasHighlights: false }

const STATUS_CONFIG = {
  free_agent:    { color: '#60a5fa', label: 'Free Agent' },
  signed:        { color: '#8892aa', label: 'Signed to a club' },
  loan_dual_reg: { color: '#a78bfa', label: 'Looking for Loan / Dual Reg' },
  just_exploring:{ color: '#f59e0b', label: 'Just Exploring' },
}

const POSITIONS = [
  'Goalkeeper','Right Back','Centre Back','Left Back',
  'Defensive Midfielder','Central Midfielder','Right Midfielder',
  'Left Midfielder','Attacking Midfielder','Right Winger',
  'Left Winger','Second Striker','Striker','Centre Forward',
]

const LEVELS = [
  'Premier League','Championship','League One','League Two',
  'National League','National League North/South','Step 3','Step 4',
  'Step 5','Step 6','Step 7 and below',
]

const STATUSES = [
  { value: 'free_agent',    label: 'Free Agent',                  color: '#60a5fa' },
  { value: 'signed',        label: 'Signed to a club',            color: '#8892aa' },
  { value: 'loan_dual_reg', label: 'Looking for Loan / Dual Reg', color: '#a78bfa' },
  { value: 'just_exploring',label: 'Just Exploring',              color: '#f59e0b' },
]

// ─── Filter Panel ─────────────────────────────────────────────────────────────

const selectStyle = {
  backgroundColor: '#0a0a0a',
  border: '1px solid #1e2235',
  color: '#e8dece',
}

function FilterSelect({ value, onChange, placeholder, children }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none appearance-none"
      style={selectStyle}
      onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
      onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  )
}

function FilterPanel({
  draft,
  onChange,
  onApply,
  onClear,
  onClose,
}: {
  draft: Filters
  onChange: (f: Filters) => void
  onApply: () => void
  onClear: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl flex flex-col"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#1e2235' }} />
        </div>

        {/* Title */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #1e2235' }}>
          <h2 className="text-xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>Filter</h2>
          <button onClick={onClose} style={{ color: '#8892aa' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="px-5 py-4 space-y-4">

          {/* Position */}
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>Position</p>
            <FilterSelect value={draft.position} onChange={v => onChange({ ...draft, position: v })} placeholder="All positions">
              {POSITIONS.map(p => <option key={p} value={p} style={{ backgroundColor: '#0a0a0a', color: '#e8dece' }}>{p}</option>)}
            </FilterSelect>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>Availability</p>
            <FilterSelect value={draft.status} onChange={v => onChange({ ...draft, status: v })} placeholder="Any status">
              {STATUSES.map(s => <option key={s.value} value={s.value} style={{ backgroundColor: '#0a0a0a', color: '#e8dece' }}>{s.label}</option>)}
            </FilterSelect>
          </div>

          {/* Level */}
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>Experience Level</p>
            <FilterSelect value={draft.level} onChange={v => onChange({ ...draft, level: v })} placeholder="Any level">
              {LEVELS.map(l => <option key={l} value={l} style={{ backgroundColor: '#0a0a0a', color: '#e8dece' }}>{l}</option>)}
            </FilterSelect>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>Location</p>
            <input
              value={draft.location}
              onChange={e => onChange({ ...draft, location: e.target.value })}
              placeholder="e.g. Manchester, London…"
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
              style={selectStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
              onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
            />
          </div>

          {/* Highlights toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>Has Highlights</p>
              <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>Only show players with video</p>
            </div>
            <button
              onClick={() => onChange({ ...draft, hasHighlights: !draft.hasHighlights })}
              className="relative flex-shrink-0"
              style={{ width: 48, height: 28 }}>
              <div className="w-full h-full rounded-full transition-colors"
                style={{ backgroundColor: draft.hasHighlights ? '#2d5fc4' : '#1e2235' }} />
              <div className="absolute top-1 rounded-full transition-all"
                style={{ width: 20, height: 20, backgroundColor: '#fff', left: draft.hasHighlights ? 24 : 4, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
          </div>

        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 py-4" style={{ borderTop: '1px solid #1e2235' }}>
          <button onClick={onClear}
            className="flex-1 py-3.5 rounded-2xl text-sm font-bold"
            style={{ border: '1px solid #1e2235', color: '#8892aa' }}>
            Clear all
          </button>
          <button onClick={onApply}
            className="flex-1 py-3.5 rounded-2xl text-sm font-bold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PlayersPage() {
  const { openSidebar } = useSidebar()
  const [players, setPlayers] = useState<Player[]>([])
  const [filtered, setFiltered] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [quickTab, setQuickTab] = useState<QuickTab>('all')
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS)
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS)
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles')
      .select('id, full_name, avatar_url, position, club, city, playing_level, status, highlight_urls, created_at')
      .in('role', ['player', 'admin'])
      .eq('approved', true)
      .order('last_active', { ascending: false, nullsFirst: false })
      .limit(200)
      .then(({ data }) => {
        setPlayers((data as Player[]) ?? [])
        setFiltered((data as Player[]) ?? [])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    let result = players

    // Quick tab
    if (quickTab === 'free_agents') result = result.filter(p => p.status === 'free_agent')
    if (quickTab === 'loan') result = result.filter(p => p.status === 'loan_dual_reg')
    if (quickTab === 'new') {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
      result = result.filter(p => new Date(p.created_at).getTime() > cutoff)
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.full_name?.toLowerCase().includes(q) ||
        p.club?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q)
      )
    }
    if (appliedFilters.position) result = result.filter(p => p.position === appliedFilters.position)
    if (appliedFilters.location) {
      const loc = appliedFilters.location.toLowerCase()
      result = result.filter(p => p.city?.toLowerCase().includes(loc))
    }
    if (appliedFilters.status) result = result.filter(p => p.status === appliedFilters.status)
    if (appliedFilters.level) result = result.filter(p => p.playing_level === appliedFilters.level)
    if (appliedFilters.hasHighlights) result = result.filter(p => (p.highlight_urls?.length ?? 0) > 0)

    setFiltered(result)
  }, [search, quickTab, appliedFilters, players])

  const activeFilterCount = [
    appliedFilters.position,
    appliedFilters.location,
    appliedFilters.status,
    appliedFilters.level,
    appliedFilters.hasHighlights,
  ].filter(Boolean).length

  function openFilters() {
    setDraftFilters(appliedFilters)
    setShowFilters(true)
  }

  function applyFilters() {
    setAppliedFilters(draftFilters)
    setShowFilters(false)
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS)
    setAppliedFilters(EMPTY_FILTERS)
    setShowFilters(false)
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {showFilters && (
        <FilterPanel
          draft={draftFilters}
          onChange={setDraftFilters}
          onApply={applyFilters}
          onClear={clearFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-5 pb-3 space-y-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={openSidebar} className="flex flex-col gap-1.5" style={{ width: 20 }}>
              <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
              <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 14 }} />
              <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
            </button>
            <h1 className="text-2xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Players
            </h1>
          </div>
          <button onClick={openFilters}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold relative"
            style={{ backgroundColor: activeFilterCount > 0 ? '#2d5fc420' : '#13172a', border: `1px solid ${activeFilterCount > 0 ? '#2d5fc4' : '#1e2235'}`, color: activeFilterCount > 0 ? '#2d5fc4' : '#8892aa' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
            </svg>
            Filter
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: '#2d5fc4', color: '#fff', fontSize: 10 }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Quick tabs */}
        <div className="flex gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          {QUICK_TABS.map(tab => {
            const active = quickTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setQuickTab(tab.key)}
                className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors"
                style={{
                  backgroundColor: active ? tab.color : '#13172a',
                  color: active ? '#fff' : '#8892aa',
                  border: `1px solid ${active ? tab.color : '#1e2235'}`,
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, club, city…"
          className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}
          onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
          onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
        />

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex gap-2 flex-wrap">
            {appliedFilters.position && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#2d5fc420', border: '1px solid #2d5fc440', color: '#2d5fc4' }}>
                {appliedFilters.position}
                <button onClick={() => setAppliedFilters(f => ({ ...f, position: '' }))} style={{ lineHeight: 1 }}>×</button>
              </span>
            )}
            {appliedFilters.location && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#2d5fc420', border: '1px solid #2d5fc440', color: '#2d5fc4' }}>
                📍 {appliedFilters.location}
                <button onClick={() => setAppliedFilters(f => ({ ...f, location: '' }))} style={{ lineHeight: 1 }}>×</button>
              </span>
            )}
            {appliedFilters.status && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#2d5fc420', border: '1px solid #2d5fc440', color: '#2d5fc4' }}>
                {STATUS_CONFIG[appliedFilters.status as keyof typeof STATUS_CONFIG]?.label}
                <button onClick={() => setAppliedFilters(f => ({ ...f, status: '' }))} style={{ lineHeight: 1 }}>×</button>
              </span>
            )}
            {appliedFilters.level && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#2d5fc420', border: '1px solid #2d5fc440', color: '#2d5fc4' }}>
                {appliedFilters.level}
                <button onClick={() => setAppliedFilters(f => ({ ...f, level: '' }))} style={{ lineHeight: 1 }}>×</button>
              </span>
            )}
            {appliedFilters.hasHighlights && (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: '#2d5fc420', border: '1px solid #2d5fc440', color: '#2d5fc4' }}>
                🎬 Has Highlights
                <button onClick={() => setAppliedFilters(f => ({ ...f, hasHighlights: false }))} style={{ lineHeight: 1 }}>×</button>
              </span>
            )}
          </div>
        )}

        <p className="text-xs" style={{ color: '#8892aa' }}>
          {filtered.length} player{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
        </div>
      ) : (
        <div>
          {filtered.map((p, i) => {
            const statusCfg = p.status ? STATUS_CONFIG[p.status] : null
            const initials = p.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
            const hasHighlights = (p.highlight_urls?.length ?? 0) > 0

            return (
              <Link key={p.id} href={`/dashboard/player/players/${p.id}`}
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ textDecoration: 'none', backgroundColor: '#0a0a0a', borderTop: i > 0 ? '1px solid #1e2235' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0d1020')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#0a0a0a')}>

                {/* Avatar */}
                <div className="flex-shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                  style={{ width: 56, height: 56, backgroundColor: '#1a1f3a', border: `2px solid ${statusCfg ? statusCfg.color + '40' : '#1e2235'}` }}>
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt={p.full_name ?? ''} className="w-full h-full object-cover object-top" />
                  ) : (
                    <span className="font-black text-lg" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                      {initials}
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{p.full_name ?? 'Player'}</p>
                    {hasHighlights && (
                      <span className="text-xs flex-shrink-0" title="Has highlights">🎬</span>
                    )}
                  </div>
                  <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>
                    {[p.position, p.playing_level].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa', fontSize: 11 }}>
                    {[p.club, p.city].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>

                {/* Status + arrow */}
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  {statusCfg && p.status !== 'signed' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ color: statusCfg.color, backgroundColor: `${statusCfg.color}18`, fontSize: 10, whiteSpace: 'nowrap' }}>
                      {statusCfg.label}
                    </span>
                  )}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1e2235" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>

              </Link>
            )
          })}

          {filtered.length === 0 && (
            <div className="py-16 text-center px-6 space-y-3">
              <p className="text-2xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#1e2235' }}>No players found</p>
              <p className="text-sm" style={{ color: '#8892aa' }}>Try adjusting your filters or search.</p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-sm" style={{ color: '#2d5fc4' }}>Clear all filters</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
