'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useSidebar } from '@/app/dashboard/player/_components/SidebarContext'
import NewBadge from '@/app/components/NewBadge'

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
  last_active: string | null
  created_at: string | null
}

type Quota = {
  messagesUsed: number
  messagesLimit: number
  periodEnd: string | null
  purchasedCredits: number
}

type Filters = {
  level: string
  role: string
  location: string
}

const EMPTY_FILTERS: Filters = { level: '', role: '', location: '' }

const COACH_LEVELS = [
  'Step 1', 'Step 2', 'Step 3', 'Step 4',
  'Step 5', 'Step 6', 'Step 7', 'U18s/Academy', 'Wales 1', 'Wales 2', 'Other',
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle = {
  backgroundColor: '#0a0a0a',
  border: '1px solid #1e2235',
  color: '#e8dece',
}

// ─── Filter select ────────────────────────────────────────────────────────────

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
      style={inputStyle}
      onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
      onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  )
}

// ─── Filter panel ─────────────────────────────────────────────────────────────

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
              style={inputStyle}
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
    <div className="flex items-center gap-3 px-4 py-4 animate-pulse"
      style={{ backgroundColor: '#13172a', borderBottom: '1px solid #1e2235' }}>
      <div className="w-12 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: '#1e2235' }} />
      <div className="flex-1 space-y-2">
        <div className="h-3 rounded w-36" style={{ backgroundColor: '#1e2235' }} />
        <div className="h-2.5 rounded w-48" style={{ backgroundColor: '#1e2235' }} />
        <div className="h-2.5 rounded w-32" style={{ backgroundColor: '#1e2235' }} />
      </div>
      <div className="w-4 h-4 rounded" style={{ backgroundColor: '#1e2235' }} />
    </div>
  )
}

// ─── Recently active marquee ──────────────────────────────────────────────────

function RecentlyActiveCard({ coach }: { coach: Coach }) {
  const initials = coach.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const detail = [coach.coaching_role, coach.coaching_level].filter(Boolean).join(' · ')

  return (
    <Link
      href={`/dashboard/coach/${coach.id}`}
      className="flex items-center gap-2.5 px-3 py-2.5 mr-2.5 rounded-xl flex-shrink-0"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none', width: 220 }}
    >
      <div className="relative flex-shrink-0">
        <div className="w-11 h-11 rounded-full overflow-hidden flex items-center justify-center"
          style={{ backgroundColor: '#1a1f3a' }}>
          {coach.avatar_url
            ? <img src={coach.avatar_url} alt="" className="w-full h-full object-cover object-top" />
            : <span className="text-sm font-black" style={{ color: '#a78bfa' }}>{initials}</span>}
        </div>
        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full"
          style={{ backgroundColor: '#3a6fda', border: '2px solid #13172a' }} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{coach.full_name ?? 'Coach'}</p>
          <NewBadge createdAt={coach.created_at} size="sm" />
        </div>
        {detail && <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>{detail}</p>}
      </div>
    </Link>
  )
}

function RecentlyActiveBanner({ coaches }: { coaches: Coach[] }) {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
  const active = coaches
    .filter(c => c.last_active && new Date(c.last_active).getTime() >= cutoff)
    .sort((a, b) => new Date(b.last_active!).getTime() - new Date(a.last_active!).getTime())

  if (active.length === 0) return null

  const loop = [...active, ...active]
  const animate = active.length >= 3

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 px-4 mb-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: '#2d5fc4', animation: 'n11-ping 1.6s cubic-bezier(0,0,0.2,1) infinite' }} />
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#3a6fda' }} />
        </span>
        <span className="text-[11px] font-black uppercase tracking-wider"
          style={{ color: '#8892aa', fontFamily: "'Barlow Condensed', sans-serif" }}>
          Recently active
        </span>
      </div>

      {animate ? (
        <div className="relative overflow-hidden pl-4">
          <div className="flex" style={{ width: 'max-content', animation: 'n11-marquee 40s linear infinite' }}>
            {loop.map((coach, i) => <RecentlyActiveCard key={`${coach.id}-${i}`} coach={coach} />)}
          </div>
        </div>
      ) : (
        <div className="flex overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
          {active.map(coach => <RecentlyActiveCard key={coach.id} coach={coach} />)}
        </div>
      )}

      <style jsx>{`
        @keyframes n11-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes n11-ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

// ─── Conversations banner (players only) ──────────────────────────────────────

function ConversationsBanner({ isPremium, quota }: { isPremium: boolean; quota: Quota | null }) {
  if (!isPremium) {
    return (
      <div className="mx-4 mt-3 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
        style={{ backgroundColor: 'rgba(45,95,196,0.08)', border: '1px solid rgba(45,95,196,0.25)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p className="text-xs truncate" style={{ color: '#8892aa' }}>Upgrade to message coaches directly</p>
        </div>
        <Link href="/dashboard/player/premium"
          className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
          Upgrade
        </Link>
      </div>
    )
  }

  if (!quota) return null

  const monthlyLeft = Math.max(0, quota.messagesLimit - quota.messagesUsed)
  const totalLeft = monthlyLeft + quota.purchasedCredits
  const isLow = totalLeft <= 1

  return (
    <div className="mx-4 mt-3 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
      style={{
        backgroundColor: isLow ? 'rgba(45,95,196,0.12)' : '#13172a',
        border: `1px solid ${isLow ? 'rgba(45,95,196,0.35)' : '#1e2235'}`,
      }}>
      <div className="flex items-start gap-2.5 min-w-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isLow ? '#2d5fc4' : '#8892aa'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <div className="min-w-0">
          <p className="text-xs font-semibold" style={{ color: '#e8dece' }}>
            {totalLeft === 0 ? 'No conversations left' : `${totalLeft} conversation${totalLeft !== 1 ? 's' : ''} left to initiate`}
          </p>
          <p className="text-xs mt-0.5 truncate" style={{ color: '#8892aa' }}>
            {totalLeft === 0 ? 'Buy more to keep reaching out' : 'Message a coach below to get noticed'}
          </p>
        </div>
      </div>
      {totalLeft === 0 ? (
        <Link href="/dashboard/player/extra-messages"
          className="flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
          Buy more
        </Link>
      ) : (
        <Link href="/dashboard/player/messages"
          className="flex-shrink-0 text-xs font-semibold"
          style={{ color: '#2d5fc4', textDecoration: 'none' }}>
          Inbox →
        </Link>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CoachesPage() {
  const router = useRouter()
  const { openSidebar } = useSidebar()

  const [viewerRole, setViewerRole] = useState<string | null>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [quota, setQuota] = useState<Quota | null>(null)
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
      if (!user) { router.push('/'); return }

      const [coachRes, profileRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, avatar_url, coaching_role, coaching_level, club, city, bio, last_active, created_at')
          .eq('role', 'coach')
          .eq('approved', true),
        supabase.from('profiles').select('role, premium').eq('id', user.id).single(),
      ])

      const role = profileRes.data?.role ?? 'player'
      const premium = profileRes.data?.premium ?? false
      setViewerRole(role)
      setIsPremium(premium)

      if (role === 'player' && premium) {
        fetch('/api/messages/quota')
          .then(r => r.json())
          .then(d => setQuota({
            messagesUsed: d.messagesUsed ?? 0,
            messagesLimit: d.messagesLimit ?? 3,
            periodEnd: d.periodEnd ?? null,
            purchasedCredits: d.purchasedCredits ?? 0,
          }))
          .catch(() => {})
      }

      const list = (coachRes.data ?? []) as Coach[]
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
      result = result.filter(c => c.coaching_level?.toLowerCase().includes(filters.level.toLowerCase()))
    }
    if (filters.role) {
      result = result.filter(c => matchesRole(c.coaching_role, filters.role))
    }
    if (filters.location) {
      result = result.filter(c => c.city?.toLowerCase().includes(filters.location.toLowerCase().trim()))
    }

    setFiltered(result)
  }, [search, filters, coaches])

  const activeFilterCount = [filters.level, filters.role, filters.location].filter(Boolean).length

  function openFilters() { setDraft(filters); setFiltersOpen(true) }
  function applyFilters() { setFilters(draft); setFiltersOpen(false) }
  function clearAll() { setSearch(''); setFilters(EMPTY_FILTERS); setDraft(EMPTY_FILTERS); setFiltersOpen(false) }

  const isPlayer = viewerRole === 'player' || viewerRole === 'admin'

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {filtersOpen && (
        <FilterPanel
          draft={draft}
          onChange={setDraft}
          onApply={applyFilters}
          onClear={clearAll}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {/* Sticky header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>

        <div className="flex items-center justify-between mb-3">
          <button onClick={openSidebar} className="flex flex-col gap-1.5" style={{ width: 20 }}>
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 14 }} />
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
          </button>
          <h1 className="text-base font-black uppercase tracking-widest"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Coaches
          </h1>
          <div style={{ width: 20 }} />
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

      {/* Recently active marquee — both roles */}
      {!loading && <RecentlyActiveBanner coaches={coaches} />}

      {/* Conversations banner — players only */}
      {!loading && isPlayer && (
        <ConversationsBanner isPremium={isPremium} quota={quota} />
      )}

      {/* List */}
      {loading ? (
        <div className="rounded-2xl overflow-hidden mx-4 mt-2" style={{ border: '1px solid #1e2235' }}>
          {[0, 1, 2, 3, 4, 5].map(i => <CoachSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-4 mt-4 rounded-2xl p-8 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
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
        <div className="mx-4 mt-2 rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
          {filtered.map((coach, i) => {
            const initials = coach.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
            const meta = [coach.coaching_role, coach.coaching_level].filter(Boolean).join(' · ')
            const sub = [coach.city, coach.club].filter(Boolean).join(' · ')

            return (
              <Link key={coach.id}
                href={`/dashboard/coach/${coach.id}`}
                className="flex items-center gap-3 px-4 py-4"
                style={{
                  backgroundColor: '#13172a',
                  borderBottom: i < filtered.length - 1 ? '1px solid #1e2235' : undefined,
                  textDecoration: 'none',
                  display: 'flex',
                }}>
                <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: '#1a1f3a' }}>
                  {coach.avatar_url
                    ? <img src={coach.avatar_url} alt="" className="w-full h-full object-cover object-top" />
                    : <span className="text-sm font-black" style={{ color: '#a78bfa' }}>{initials}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: '#e8dece' }}>{coach.full_name ?? 'Coach'}</p>
                    <NewBadge createdAt={coach.created_at} size="sm" />
                  </div>
                  {meta && <p className="text-xs mt-0.5 truncate" style={{ color: '#8892aa' }}>{meta}</p>}
                  {sub && <p className="text-xs mt-0.5 truncate" style={{ color: '#8892aa' }}>{sub}</p>}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            )
          })}
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
