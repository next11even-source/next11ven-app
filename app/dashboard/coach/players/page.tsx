'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { POSITIONS } from '@/lib/positions'
import { LEVELS } from '@/lib/levels'
import CoachSidebar from '@/app/dashboard/coach/_components/CoachSidebar'

type Player = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  secondary_position: string | null
  club: string | null
  city: string | null
  playing_level: string | null
  status: string | null
  premium: boolean
}

const STATUSES = [
  { value: 'free_agent',     label: 'Free Agent' },
  { value: 'signed',         label: 'Signed' },
  { value: 'loan_dual_reg',  label: 'Loan / Dual Reg' },
  { value: 'just_exploring', label: 'Just Exploring' },
]

const STATUS_COLOR: Record<string, string> = {
  free_agent: '#60a5fa', signed: '#8892aa', loan_dual_reg: '#a78bfa', just_exploring: '#f59e0b',
}

const PAGE_SIZE = 20
const iStyle = { backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' as const }

export default function CoachPlayersPage() {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [coachProfile, setCoachProfile] = useState<{ full_name: string | null; avatar_url: string | null; coaching_role: string | null } | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [clubFilter, setClubFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      supabase.from('profiles').select('full_name, avatar_url, coaching_role').eq('id', user.id).single()
        .then(({ data }) => setCoachProfile(data ?? null))
    })
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, position, secondary_position, club, city, playing_level, status, premium')
      .in('role', ['player', 'admin'])
      .eq('approved', true)
      .order('premium', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPlayers((data as Player[]) ?? [])
        setLoading(false)
      })
  }, [])

  const filtered = players.filter(p => {
    if (search && !p.full_name?.toLowerCase().includes(search.toLowerCase())) return false
    if (posFilter && p.position !== posFilter && p.secondary_position !== posFilter) return false
    if (levelFilter && !p.playing_level?.toLowerCase().includes(levelFilter.toLowerCase())) return false
    if (statusFilter && p.status !== statusFilter) return false
    if (clubFilter && !p.club?.toLowerCase().includes(clubFilter.toLowerCase())) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const activeFilterCount = [posFilter, levelFilter, statusFilter, clubFilter].filter(Boolean).length

  function handleFilterChange(setter: (v: string) => void, value: string) {
    setter(value); setPage(0)
  }

  function clearFilters() {
    setPosFilter(''); setLevelFilter(''); setStatusFilter(''); setClubFilter(''); setPage(0)
  }

  return (
    <>
      <CoachSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={coachProfile} />
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 space-y-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="flex-shrink-0 p-1 -ml-1" style={{ color: '#8892aa' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="text-xl font-black uppercase tracking-widest"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Players
            </h1>
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: showFilters ? 'rgba(45,95,196,0.15)' : '#13172a',
              border: `1px solid ${showFilters ? '#2d5fc4' : '#1e2235'}`,
              color: showFilters ? '#2d5fc4' : '#8892aa',
            }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-black"
                style={{ backgroundColor: '#2d5fc4', color: '#fff', fontSize: 9 }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Search — always visible */}
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search by name…"
          className="w-full rounded-xl px-4 py-2.5 text-sm outline-none"
          style={iStyle}
          onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
          onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
        />

        {/* Filter panel — toggled */}
        {showFilters && (
          <div className="space-y-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <select value={posFilter} onChange={e => handleFilterChange(setPosFilter, e.target.value)}
                className="rounded-xl px-3 py-2.5 text-sm outline-none appearance-none" style={iStyle}>
                <option value="">All positions</option>
                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={levelFilter} onChange={e => handleFilterChange(setLevelFilter, e.target.value)}
                className="rounded-xl px-3 py-2.5 text-sm outline-none appearance-none" style={iStyle}>
                <option value="">All levels</option>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={statusFilter} onChange={e => handleFilterChange(setStatusFilter, e.target.value)}
                className="rounded-xl px-3 py-2.5 text-sm outline-none appearance-none" style={iStyle}>
                <option value="">All statuses</option>
                {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <input
                value={clubFilter}
                onChange={e => handleFilterChange(setClubFilter, e.target.value)}
                placeholder="Filter by club…"
                className="rounded-xl px-3 py-2.5 text-sm outline-none"
                style={iStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
                onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
              />
            </div>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters}
                className="text-xs uppercase tracking-wider"
                style={{ color: '#2d5fc4' }}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs" style={{ color: '#8892aa' }}>
          {loading ? 'Loading…' : `${filtered.length} player${filtered.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
        </div>
      ) : paginated.length === 0 ? (
        <div className="mx-4 rounded-2xl p-10 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>No players match your search.</p>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="mt-3 text-xs uppercase tracking-wider" style={{ color: '#2d5fc4' }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="px-4 space-y-2 pt-1">
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            {paginated.map((p, i) => (
              <a key={p.id} href={`/dashboard/player/players/${p.id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors"
                style={{ backgroundColor: '#13172a', borderBottom: i < paginated.length - 1 ? '1px solid #1e2235' : undefined, textDecoration: 'none', display: 'flex' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0f1428')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#13172a')}>
                <div className="relative flex-shrink-0">
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt={p.full_name ?? ''} className="rounded-full object-cover" style={{ width: 44, height: 44 }} />
                    : <div className="rounded-full flex items-center justify-center font-bold text-xs"
                        style={{ width: 44, height: 44, backgroundColor: '#1e2235', color: '#8892aa' }}>
                        {p.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
                      </div>
                  }
                  {p.premium && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center font-black"
                      style={{ backgroundColor: '#2d5fc4', color: '#fff', fontSize: 8 }}>P</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{p.full_name ?? 'Unknown'}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>
                    {[p.position, p.club, p.city].filter(Boolean).join(' · ') || '—'}
                  </p>
                  {p.playing_level && (
                    <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{p.playing_level}</p>
                  )}
                </div>
                {p.status && (
                  <span className="text-xs flex-shrink-0 font-medium"
                    style={{ color: STATUS_COLOR[p.status] ?? '#8892aa' }}>
                    {STATUSES.find(s => s.value === p.status)?.label ?? p.status}
                  </span>
                )}
              </a>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1 pb-2">
              <p className="text-xs" style={{ color: '#8892aa' }}>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                  className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ border: '1px solid #1e2235', color: '#e8dece', backgroundColor: '#13172a' }}>
                  ← Prev
                </button>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
                  className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                  style={{ border: '1px solid #1e2235', color: '#e8dece', backgroundColor: '#13172a' }}>
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  )
}
