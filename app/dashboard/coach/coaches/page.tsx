'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import CoachSidebar from '@/app/dashboard/coach/_components/CoachSidebar'

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

export default function CoachCoachesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [coachProfile, setCoachProfile] = useState<{ full_name: string | null; avatar_url: string | null; coaching_role: string | null } | null>(null)
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [filtered, setFiltered] = useState<Coach[]>([])
  const [search, setSearch] = useState('')
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
    if (!q) { setFiltered(coaches); return }
    setFiltered(coaches.filter(c =>
      [c.full_name, c.coaching_role, c.club, c.city, c.coaching_level]
        .some(f => f?.toLowerCase().includes(q))
    ))
  }, [search, coaches])

  return (
    <>
      <CoachSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={coachProfile} />

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

          {/* Search */}
          <div className="relative">
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
        </div>

        {/* Count */}
        {!loading && (
          <p className="px-4 pt-3 pb-1 text-xs" style={{ color: '#8892aa' }}>
            {filtered.length} coach{filtered.length !== 1 ? 'es' : ''} on the platform
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
              {search ? 'No coaches match your search.' : 'No coaches have joined yet — check back soon.'}
            </p>
            {search && (
              <button onClick={() => setSearch('')} className="mt-3 text-xs font-bold" style={{ color: '#2d5fc4' }}>
                Clear search
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

                  {/* Avatar */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#1a1f3a', border: '2px solid #1e2235' }}>
                    {coach.avatar_url
                      ? <img src={coach.avatar_url} alt="" className="w-full h-full object-cover object-top" />
                      : <span className="text-lg font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#a78bfa' }}>{initials}</span>}
                  </div>

                  {/* Details */}
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
