'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import CoachSidebar from '@/app/dashboard/coach/_components/CoachSidebar'

// ─── Types ────────────────────────────────────────────────────────────────────

type Coach = {
  id: string
  full_name: string | null
  avatar_url: string | null
  coaching_role: string | null
  coaching_level: string | null
  club: string | null
  city: string | null
  bio: string | null
}

type Filters = {
  level: string
  role: string
  location: string
}

const EMPTY_FILTERS: Filters = { level: '', role: '', location: '' }

// ─── Filter config ────────────────────────────────────────────────────────────

const COACH_LEVELS = [
  'Step 1', 'Step 2', 'Step 3', 'Step 4',
  'Step 5', 'Step 6', 'Step 7', 'County', 'Youth', 'Grassroots',
]

const COACH_ROLES = [
  'Manager', 'Assistant', 'First Team', 'Goalkeeper',
  'Scout', 'Physio', 'Academy', 'Analyst',
]

function matchesRole(coachRole: string | null, filter: string): boolean {
  if (!coachRole) return false
  const r = coachRole.toLowerCase()
  const f = filter.toLowerCase()
  if (f === 'goalkeeper') return r.includes('goalkeeper') || r.includes(' gk ') || r.startsWith('gk ')
  if (f === 'first team') return r.includes('first team') || r.includes('1st team')
  return r.includes(f)
}

// ─── Filter panel (bottom sheet) ──────────────────────────────────────────────

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
    <div className="fixed inset-0 z-[100] flex items-end" onClick={onClose}>
      <div
        className="w-full rounded-t-3xl flex flex-col"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', maxHeight: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#1e2235' }} />
        </div>

        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid #1e2235' }}>
          <h2 className="text-xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>Filter</h2>
          <button onClick={onClose} style={{ color: '#8892aa' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>Level</p>
            <FilterSelect value={draft.level} onChange={v => onChange({ ...draft, level: v })} placeholder="Any level">
              {COACH_LEVELS.map(l => <option key={l} value={l} style={{ backgroundColor: '#0a0a0a', color: '#e8dece' }}>{l}</option>)}
            </FilterSelect>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>Role</p>
            <FilterSelect value={draft.role} onChange={v => onChange({ ...draft, role: v })} placeholder="Any role">
              {COACH_ROLES.map(r => <option key={r} value={r} style={{ backgroundColor: '#0a0a0a', color: '#e8dece' }}>{r}</option>)}
            </FilterSelect>
          </div>

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

        </div>

        <div className="flex gap-3 px-5 pt-4" style={{ borderTop: '1px solid #1e2235', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CoachSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse" style={{ backgroundColor: '#0a0a0a', borderBottom: '1px solid #1e2235' }}>
      <div className="w-14 h-14 rounded-xl flex-shrink-0" style={{ backgroundColor: '#1e2235' }} />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 rounded w-36" style={{ backgroundColor: '#1e2235' }} />
        <div className="h-2.5 rounded w-48" style={{ backgroundColor: '#1e2235' }} />
        <div className="h-2.5 rounded w-32" style={{ backgroundColor: '#1e2235' }} />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachCoachesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [coachProfile, setCoachProfile] = useState<{ full_name: string | null; avatar_url: string | null; coaching_role: string | null } | null>(null)
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [filtered, setFiltered] = useState<Coach[]>([])
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return

      supabase.from('profiles').select('full_name, avatar_url, coaching_role').eq('id', user.id).single()
        .then(({ data }) => setCoachProfile(data ?? null))

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, coaching_role, coaching_level, club, city, bio')
        .eq('role', 'coach')
        .eq('approved', true)

      const list = (data ?? []) as Coach[]
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]]
      }
      setCoaches(list)
      setFiltered(list)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const q = search.toLowerCase().trim()
    let result = coaches

    if (q) {
      result = result.filter(c =>
        [c.full_name, c.coaching_role, c.club, c.city, c.coaching_level]
          .some(f => f?.toLowerCase().includes(q))
      )
    }
    if (filters.level) {
      result = result.filter(c =>
        c.coaching_level?.toLowerCase().includes(filters.level.toLowerCase())
      )
    }
    if (filters.role) {
      result = result.filter(c => matchesRole(c.coaching_role, filters.role))
    }
    if (filters.location) {
      result = result.filter(c =>
        c.city?.toLowerCase().includes(filters.location.toLowerCase().trim())
      )
    }

    setFiltered(result)
  }, [search, filters, coaches])

  const activeFilterCount = [filters.level, filters.role, filters.location].filter(Boolean).length

  function openFilters() {
    setDraft(filters)
    setFiltersOpen(true)
  }

  function applyFilters() {
    setFilters(draft)
    setFiltersOpen(false)
  }

  function clearAll() {
    setSearch('')
    setFilters(EMPTY_FILTERS)
    setDraft(EMPTY_FILTERS)
    setFiltersOpen(false)
  }

  return (
    <>
      <CoachSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={coachProfile} />

      {filtersOpen && (
        <FilterPanel
          draft={draft}
          onChange={setDraft}
          onApply={applyFilters}
          onClear={clearAll}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>

        {/* Header */}
        <div className="sticky top-0 z-10 px-4 pt-5 pb-3 space-y-3"
          style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="flex flex-col gap-1.5" style={{ width: 20 }}>
              <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
              <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 14 }} />
              <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
            </button>
            <h1 className="text-2xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Coaches
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24"
                fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search by name, club, role…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
                onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
              />
            </div>
            <button
              onClick={openFilters}
              className="relative flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold flex-shrink-0"
              style={{
                backgroundColor: activeFilterCount > 0 ? '#2d5fc4' : '#13172a',
                border: `1px solid ${activeFilterCount > 0 ? '#2d5fc4' : '#1e2235'}`,
                color: activeFilterCount > 0 ? '#fff' : '#8892aa',
              }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-black"
                  style={{ backgroundColor: '#fff', color: '#2d5fc4' }}>
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Count */}
        {!loading && (
          <p className="px-4 pt-3 pb-1 text-xs" style={{ color: '#8892aa' }}>
            {filtered.length} coach{filtered.length !== 1 ? 'es' : ''} on the platform
            {activeFilterCount > 0 && ' matching filters'}
          </p>
        )}

        {/* List */}
        {loading ? (
          <div className="mt-2">
            {[0,1,2,3,4,5].map(i => <CoachSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mx-4 mt-6 rounded-2xl p-8 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>
              {activeFilterCount > 0 || search ? 'No coaches match your filters.' : 'No coaches have joined yet — check back soon.'}
            </p>
            {(activeFilterCount > 0 || search) && (
              <button onClick={clearAll} className="mt-3 text-xs font-bold" style={{ color: '#2d5fc4' }}>
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="mt-2">
            {filtered.map((coach, i) => {
              const initials = coach.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
              const meta = [coach.coaching_role, coach.coaching_level].filter(Boolean).join(' · ')
              const sub = [coach.city, coach.club].filter(Boolean).join(' · ')

              return (
                <Link key={coach.id}
                  href={`/dashboard/coach/${coach.id}`}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{
                    textDecoration: 'none',
                    backgroundColor: '#0a0a0a',
                    borderTop: i > 0 ? '1px solid #1e2235' : 'none',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0d1020')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#0a0a0a')}>

                  <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#1a1f3a', border: '2px solid #1e2235' }}>
                    {coach.avatar_url
                      ? <img src={coach.avatar_url} alt="" className="w-full h-full object-cover object-top" />
                      : <span className="text-lg font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#a78bfa' }}>{initials}</span>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{coach.full_name ?? 'Coach'}</p>
                    {meta && <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>{meta}</p>}
                    {sub && <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa', fontSize: 11 }}>{sub}</p>}
                  </div>

                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1e2235" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
