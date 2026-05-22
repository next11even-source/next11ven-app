'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { useSidebar } from '../_components/SidebarContext'

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

type Quota = {
  messagesUsed: number
  messagesLimit: number
  periodEnd: string | null
  purchasedCredits: number
}

// ─── Filter config ────────────────────────────────────────────────────────────

const LEVEL_CHIPS = [
  'All', 'Step 1', 'Step 2', 'Step 3', 'Step 4',
  'Step 5', 'Step 6', 'Step 7', 'County', 'Youth', 'Grassroots',
]

const ROLE_CHIPS = [
  'All', 'Manager', 'Assistant', 'First Team', 'Goalkeeper',
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

// ─── Chip component ───────────────────────────────────────────────────────────

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors"
      style={{
        backgroundColor: active ? '#2d5fc4' : '#13172a',
        color: active ? '#fff' : '#8892aa',
        border: `1px solid ${active ? '#2d5fc4' : '#1e2235'}`,
      }}>
      {label}
    </button>
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
      <div className="w-5 h-5 rounded" style={{ backgroundColor: '#1e2235' }} />
    </div>
  )
}

// ─── Conversations banner ─────────────────────────────────────────────────────

function ConversationsBanner({ isPremium, quota }: { isPremium: boolean; quota: Quota | null }) {
  if (!isPremium) {
    return (
      <div className="mx-4 mt-3 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
        style={{ backgroundColor: 'rgba(45,95,196,0.08)', border: '1px solid rgba(45,95,196,0.25)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p className="text-xs truncate" style={{ color: '#8892aa' }}>
            Upgrade to message coaches directly
          </p>
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
            {totalLeft === 0
              ? 'No conversations left'
              : `${totalLeft} conversation${totalLeft !== 1 ? 's' : ''} left to initiate`}
          </p>
          <p className="text-xs mt-0.5 truncate" style={{ color: '#8892aa' }}>
            {totalLeft === 0
              ? 'Buy more to keep reaching out'
              : 'Message a coach below to get noticed'}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachesPage() {
  const router = useRouter()
  const { openSidebar } = useSidebar()
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [filtered, setFiltered] = useState<Coach[]>([])
  const [locations, setLocations] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [loading, setLoading] = useState(true)
  const [isPremium, setIsPremium] = useState(false)
  const [quota, setQuota] = useState<Quota | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }

      const [coachRes, profileRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, avatar_url, coaching_role, coaching_level, club, city, bio')
          .eq('role', 'coach')
          .eq('approved', true),
        supabase.from('profiles').select('premium').eq('id', user.id).single(),
      ])

      const premium = profileRes.data?.premium ?? false
      setIsPremium(premium)

      if (premium) {
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

      const locs = Array.from(
        new Set(list.map(c => c.city).filter(Boolean) as string[])
      ).sort()
      setLocations(locs)

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
    if (filterLevel) {
      result = result.filter(c =>
        c.coaching_level?.toLowerCase().includes(filterLevel.toLowerCase())
      )
    }
    if (filterRole) {
      result = result.filter(c => matchesRole(c.coaching_role, filterRole))
    }
    if (filterLocation) {
      result = result.filter(c =>
        c.city?.toLowerCase() === filterLocation.toLowerCase()
      )
    }

    setFiltered(result)
  }, [search, filterLevel, filterRole, filterLocation, coaches])

  const activeFilterCount = [filterLevel, filterRole, filterLocation].filter(Boolean).length

  function clearAll() {
    setSearch('')
    setFilterLevel('')
    setFilterRole('')
    setFilterLocation('')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {/* Sticky header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>

        {/* Title row */}
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
          {activeFilterCount > 0 ? (
            <button onClick={clearAll} className="text-xs font-bold" style={{ color: '#2d5fc4' }}>
              Clear
            </button>
          ) : (
            <div style={{ width: 28 }} />
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, club..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}
          />
        </div>

        {/* Level filter */}
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wider mb-1.5 font-semibold" style={{ color: '#8892aa' }}>Level</p>
          <div className="flex gap-1.5 pb-0.5" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
            {LEVEL_CHIPS.map(chip => (
              <Chip
                key={chip}
                label={chip}
                active={chip === 'All' ? filterLevel === '' : filterLevel === chip}
                onClick={() => setFilterLevel(chip === 'All' ? '' : chip)}
              />
            ))}
          </div>
        </div>

        {/* Role filter */}
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wider mb-1.5 font-semibold" style={{ color: '#8892aa' }}>Role</p>
          <div className="flex gap-1.5 pb-0.5" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
            {ROLE_CHIPS.map(chip => (
              <Chip
                key={chip}
                label={chip}
                active={chip === 'All' ? filterRole === '' : filterRole === chip}
                onClick={() => setFilterRole(chip === 'All' ? '' : chip)}
              />
            ))}
          </div>
        </div>

        {/* Location filter — only shown when there are cities in the data */}
        {locations.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider mb-1.5 font-semibold" style={{ color: '#8892aa' }}>Location</p>
            <div className="flex gap-1.5 pb-0.5" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
              <Chip
                label="All"
                active={filterLocation === ''}
                onClick={() => setFilterLocation('')}
              />
              {locations.map(loc => (
                <Chip
                  key={loc}
                  label={loc}
                  active={filterLocation === loc}
                  onClick={() => setFilterLocation(loc)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Conversations left banner */}
      {!loading && (
        <ConversationsBanner isPremium={isPremium} quota={quota} />
      )}

      {/* Count */}
      {!loading && (
        <p className="px-4 pt-3 pb-1 text-xs" style={{ color: '#8892aa' }}>
          {filtered.length} coach{filtered.length !== 1 ? 'es' : ''}
          {activeFilterCount > 0 && ' matching filters'}
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="rounded-2xl overflow-hidden mx-4 mt-3" style={{ border: '1px solid #1e2235' }}>
          {[0, 1, 2, 3, 4, 5].map(i => <CoachSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-4 mt-6 rounded-2xl p-8 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>
            {activeFilterCount > 0 || search
              ? 'No coaches match your filters.'
              : 'No coaches have joined yet — check back soon.'}
          </p>
          {(activeFilterCount > 0 || search) && (
            <button onClick={clearAll}
              className="mt-3 text-xs font-bold"
              style={{ color: '#2d5fc4' }}>
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <div className="mx-4 mt-3 rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
          {filtered.map((coach, i) => {
            const initials = coach.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
            const meta = [coach.coaching_role, coach.club].filter(Boolean).join(' · ')
            const sub = [coach.coaching_level, coach.city].filter(Boolean).join(' · ')

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
                    ? <img src={coach.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-sm font-black" style={{ color: '#a78bfa' }}>{initials}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{coach.full_name ?? 'Coach'}</p>
                  {meta && <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{meta}</p>}
                  {sub && <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{sub}</p>}
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
