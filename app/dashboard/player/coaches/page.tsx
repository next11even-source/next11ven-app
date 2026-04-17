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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachesPage() {
  const router = useRouter()
  const { openSidebar } = useSidebar()
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [filtered, setFiltered] = useState<Coach[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, coaching_role, coaching_level, club, city, bio')
        .eq('role', 'coach')
        .eq('approved', true)
        .order('full_name', { ascending: true })

      const list = (data ?? []) as Coach[]
      setCoaches(list)
      setFiltered(list)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const q = search.toLowerCase().trim()
    if (!q) { setFiltered(coaches); return }
    setFiltered(coaches.filter(c =>
      [c.full_name, c.coaching_role, c.club, c.city, c.coaching_level]
        .some(f => f?.toLowerCase().includes(q))
    ))
  }, [search, coaches])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {/* Header */}
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

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, club, role..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#e8dece' }}
          />
        </div>
      </div>

      {/* Count */}
      {!loading && (
        <p className="px-4 pt-3 pb-1 text-xs" style={{ color: '#8892aa' }}>
          {filtered.length} coach{filtered.length !== 1 ? 'es' : ''} on the platform
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="rounded-2xl overflow-hidden mx-4 mt-3" style={{ border: '1px solid #1e2235' }}>
          {[0,1,2,3,4,5].map(i => <CoachSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="mx-4 mt-6 rounded-2xl p-8 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>
            {search ? 'No coaches match your search.' : 'No coaches have joined yet — check back soon.'}
          </p>
          {search && (
            <button onClick={() => setSearch('')}
              className="mt-3 text-xs font-bold"
              style={{ color: '#2d5fc4' }}>
              Clear search
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
