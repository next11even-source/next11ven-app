'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { timeAgo } from '@/lib/utils'
import { useSidebar } from '../_components/SidebarContext'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileView = {
  id: string
  viewed_at: string
  viewer_id: string
  viewer: {
    full_name: string | null
    club: string | null
    role: string | null
    avatar_url: string | null
  } | null
}

type ViewerGroup = {
  viewer_id: string
  full_name: string | null
  avatar_url: string | null
  club: string | null
  role: string | null
  count: number
  last_viewed: string
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ViewerSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 animate-pulse"
      style={{ backgroundColor: '#13172a', borderBottom: '1px solid #1e2235' }}>
      <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: '#1e2235' }} />
      <div className="flex-1 space-y-2">
        <div className="h-3 rounded w-32" style={{ backgroundColor: '#1e2235' }} />
        <div className="h-2.5 rounded w-48" style={{ backgroundColor: '#1e2235' }} />
      </div>
      <div className="h-2.5 rounded w-10" style={{ backgroundColor: '#1e2235' }} />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const router = useRouter()
  const { openSidebar } = useSidebar()
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [isPremium, setIsPremium] = useState(false)
  const [views, setViews] = useState<ProfileView[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setPlayerId(user.id)

      const [profileRes, viewsRes] = await Promise.all([
        supabase.from('profiles').select('premium').eq('id', user.id).single(),
        supabase.from('player_views')
          .select('id, viewer_id, viewed_at, viewer:viewer_id(full_name, club, role, avatar_url)')
          .eq('player_id', user.id)
          .order('viewed_at', { ascending: false })
          .limit(200),
      ])

      setIsPremium(profileRes.data?.premium ?? false)
      const allViews = (viewsRes.data as unknown as ProfileView[]) ?? []
      setViews(allViews.filter(v => v.viewer?.role === 'player' || v.viewer?.role === 'coach' || v.viewer?.role === 'admin'))
      setLoading(false)
    })
  }, [])

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const weekViews = views.filter(v => v.viewed_at > weekAgo)
  const coachViews = weekViews.filter(v => v.viewer?.role === 'coach')

  // Deduplicate by viewer
  const viewerMap = new Map<string, ViewerGroup>()
  for (const v of views) {
    if (!v.viewer_id) continue
    const existing = viewerMap.get(v.viewer_id)
    if (!existing) {
      viewerMap.set(v.viewer_id, {
        viewer_id: v.viewer_id,
        full_name: v.viewer?.full_name ?? null,
        avatar_url: v.viewer?.avatar_url ?? null,
        club: v.viewer?.club ?? null,
        role: v.viewer?.role ?? null,
        count: 1,
        last_viewed: v.viewed_at,
      })
    } else {
      existing.count++
      if (v.viewed_at > existing.last_viewed) existing.last_viewed = v.viewed_at
    }
  }
  const uniqueViewers = Array.from(viewerMap.values()).sort(
    (a, b) => new Date(b.last_viewed).getTime() - new Date(a.last_viewed).getTime()
  )
  const coachViewers = uniqueViewers.filter(v => v.role === 'coach')

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 flex items-center justify-between"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <button onClick={openSidebar} className="flex flex-col gap-1.5" style={{ width: 20 }}>
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 14 }} />
          <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
        </button>
        <h1 className="text-base font-black uppercase tracking-widest"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          My Activity
        </h1>
        <div style={{ width: 20 }} />
      </div>

      {loading ? (
        <div className="space-y-5 px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            {[0,1].map(i => (
              <div key={i} className="rounded-2xl px-4 py-4 animate-pulse" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <div className="h-8 rounded w-12 mx-auto mb-2" style={{ backgroundColor: '#1e2235' }} />
                <div className="h-3 rounded w-24 mx-auto" style={{ backgroundColor: '#1e2235' }} />
              </div>
            ))}
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            {[0,1,2,3].map(i => <ViewerSkeleton key={i} />)}
          </div>
        </div>
      ) : (
        <div className="space-y-5 px-4 py-4">

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Views this week', value: weekViews.length, sub: 'all roles' },
              { label: 'Coach views', value: coachViews.length, sub: 'this week', highlight: coachViews.length > 0 },
            ].map(stat => (
              <div key={stat.label} className="rounded-2xl px-4 py-4 text-center"
                style={{ backgroundColor: '#13172a', border: `1px solid ${stat.highlight ? 'rgba(45,95,196,0.4)' : '#1e2235'}` }}>
                <p className="text-3xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: stat.highlight ? '#2d5fc4' : '#e8dece' }}>
                  {stat.value}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#e8dece' }}>{stat.label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* All-time count */}
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <p className="text-sm" style={{ color: '#8892aa' }}>Total profile views (all time)</p>
            <p className="text-lg font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>{views.length}</p>
          </div>

          {/* Who viewed you */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                Who Viewed You
              </h3>
              {!isPremium && (
                <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ backgroundColor: 'rgba(45,95,196,0.12)', color: '#2d5fc4', border: '1px solid rgba(45,95,196,0.3)' }}>
                  Premium
                </span>
              )}
            </div>

            {uniqueViewers.length === 0 ? (
              <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <p className="text-sm" style={{ color: '#8892aa' }}>No profile views yet — keep your profile updated to get noticed.</p>
                <Link href="/dashboard/player/profile"
                  className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-bold"
                  style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                  Complete My Profile
                </Link>
              </div>
            ) : isPremium ? (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
                {uniqueViewers.map((v, i) => {
                  const initials = v.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
                  const isCoach = v.role === 'coach'
                  return (
                    <div key={v.viewer_id} className="flex items-center gap-3 px-4 py-3.5"
                      style={{ backgroundColor: '#13172a', borderBottom: i < uniqueViewers.length - 1 ? '1px solid #1e2235' : undefined }}>
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center" style={{ backgroundColor: '#1e2235' }}>
                          {v.avatar_url
                            ? <img src={v.avatar_url} alt="" className="w-full h-full object-cover" />
                            : <span className="text-xs font-bold" style={{ color: isCoach ? '#a78bfa' : '#2d5fc4' }}>{initials}</span>}
                        </div>
                        {isCoach && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: '#a78bfa', fontSize: 7, color: '#fff', fontWeight: 'bold' }}>C</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{v.full_name ?? 'Unknown'}</p>
                        <p className="text-xs truncate" style={{ color: '#8892aa' }}>
                          {isCoach ? 'Coach' : 'Player'}{v.club ? ` · ${v.club}` : ''}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs" style={{ color: '#8892aa' }}>{timeAgo(v.last_viewed)}</p>
                        {v.count > 1 && <p className="text-xs font-bold mt-0.5" style={{ color: '#2d5fc4' }}>{v.count}x</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Premium lock */
              <div className="relative">
                <div className="rounded-2xl overflow-hidden pointer-events-none select-none"
                  style={{ border: '1px solid #1e2235', filter: 'blur(4px)', opacity: 0.4 }}>
                  {[...Array(Math.min(uniqueViewers.length, 4))].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3.5"
                      style={{ backgroundColor: '#13172a', borderBottom: i < 3 ? '1px solid #1e2235' : undefined }}>
                      <div className="w-10 h-10 rounded-full" style={{ backgroundColor: '#1e2235' }} />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 rounded" style={{ backgroundColor: '#1e2235', width: '60%' }} />
                        <div className="h-2.5 rounded" style={{ backgroundColor: '#1e2235', width: '40%' }} />
                      </div>
                      <div className="h-2.5 w-10 rounded" style={{ backgroundColor: '#1e2235' }} />
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl"
                  style={{ backgroundColor: 'rgba(10,10,10,0.7)', backdropFilter: 'blur(2px)' }}>
                  <p className="text-sm font-bold text-center px-6" style={{ color: '#e8dece' }}>
                    {coachViewers.length > 0
                      ? `${coachViewers.length} coach${coachViewers.length > 1 ? 'es' : ''} viewed your profile`
                      : `${uniqueViewers.length} person${uniqueViewers.length > 1 ? 's' : ''} viewed your profile`}
                  </p>
                  <p className="text-xs text-center px-8" style={{ color: '#8892aa' }}>
                    Upgrade to see exactly who's viewing you
                  </p>
                  <Link href="/dashboard/player/premium"
                    className="px-5 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider"
                    style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                    Go Premium · £6.99/mo
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
