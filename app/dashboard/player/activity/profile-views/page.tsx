'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, MessageCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { timeAgo } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileView = {
  id: string
  viewed_at: string
  viewer_id: string
  viewer: { full_name: string | null; club: string | null; role: string | null; avatar_url: string | null } | null
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

function Skeleton() {
  return (
    <div className="space-y-4 px-4 py-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: '#1e2235' }} />
          <div className="flex-1 space-y-2">
            <div className="h-3 rounded" style={{ backgroundColor: '#1e2235', width: '60%' }} />
            <div className="h-2.5 rounded" style={{ backgroundColor: '#1e2235', width: '40%' }} />
          </div>
          <div className="h-2.5 w-10 rounded" style={{ backgroundColor: '#1e2235' }} />
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfileViewsPage() {
  const router = useRouter()
  const [viewers, setViewers] = useState<ViewerGroup[]>([])
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }

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
      const filtered = allViews.filter(v => ['player', 'coach', 'admin'].includes(v.viewer?.role ?? ''))
      const viewerMap = new Map<string, ViewerGroup>()
      for (const v of filtered) {
        if (!v.viewer_id) continue
        const ex = viewerMap.get(v.viewer_id)
        if (!ex) {
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
          ex.count++
          if (v.viewed_at > ex.last_viewed) ex.last_viewed = v.viewed_at
        }
      }
      setViewers(Array.from(viewerMap.values()).sort((a, b) => new Date(b.last_viewed).getTime() - new Date(a.last_viewed).getTime()))
      setLoading(false)
    })
  }, [router])

  const coachViewers = viewers.filter(v => v.role === 'coach')

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 flex items-center gap-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <button onClick={() => router.back()} className="flex items-center justify-center w-8 h-8 rounded-full"
          style={{ backgroundColor: '#13172a' }}>
          <ArrowLeft size={16} style={{ color: '#e8dece' }} />
        </button>
        <h1 className="flex-1 text-base font-black uppercase tracking-widest"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Profile Views
        </h1>
        {viewers.length > 0 && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: '#a78bfa20', color: '#a78bfa' }}>
            {viewers.length}
          </span>
        )}
      </div>

      {loading ? <Skeleton /> : viewers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: '#a78bfa20' }}>
            <Eye size={24} style={{ color: '#a78bfa' }} />
          </div>
          <p className="font-bold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, color: '#e8dece', letterSpacing: '0.04em' }}>
            No views yet
          </p>
          <p className="mt-1 text-sm" style={{ color: '#8892aa' }}>
            Keep your profile updated to get noticed by coaches.
          </p>
          <Link href="/dashboard/player/profile"
            className="inline-block mt-5 px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
            Complete My Profile
          </Link>
        </div>
      ) : isPremium ? (
        <div className="px-4 py-4 space-y-4">
          {coachViewers.length > 0 && (
            <div className="px-4 py-3 rounded-2xl flex items-center gap-3"
              style={{ backgroundColor: '#a78bfa10', border: '1px solid #a78bfa30' }}>
              <MessageCircle size={15} style={{ color: '#a78bfa', flexShrink: 0 }} />
              <p className="text-sm" style={{ color: '#a78bfa' }}>
                <span className="font-bold">{coachViewers.length} coach{coachViewers.length > 1 ? 'es' : ''}</span> viewed your profile — message them first
              </p>
            </div>
          )}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            {viewers.map((v, i) => {
              const isCoach = v.role === 'coach'
              const initials = v.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
              return (
                <div key={v.viewer_id} className="flex items-center gap-3 px-4 py-3.5"
                  style={{ backgroundColor: '#13172a', borderBottom: i < viewers.length - 1 ? '1px solid #1e2235' : undefined, minHeight: 44 }}>
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
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs" style={{ color: '#8892aa' }}>{timeAgo(v.last_viewed)}</p>
                      {v.count > 1 && <p className="text-xs font-bold mt-0.5" style={{ color: '#2d5fc4' }}>{v.count}×</p>}
                    </div>
                    {isCoach && (
                      <Link
                        href="/dashboard/player/messages"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold"
                        style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        <MessageCircle size={12} />
                        Message
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {coachViewers.length > 0 && (
            <Link
              href="/dashboard/player/extra-messages"
              className="flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold"
              style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#8892aa', textDecoration: 'none' }}>
              <MessageCircle size={14} />
              Need more conversations? Buy extra messages →
            </Link>
          )}
        </div>
      ) : (
        // Free user — blurred list + messaging-led upgrade prompt
        <div className="px-4 py-4">
          <div className="relative">
            <div className="rounded-2xl overflow-hidden pointer-events-none select-none"
              style={{ border: '1px solid #1e2235', filter: 'blur(4px)', opacity: 0.4 }}>
              {[...Array(Math.min(viewers.length, 5))].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5"
                  style={{ backgroundColor: '#13172a', borderBottom: i < 4 ? '1px solid #1e2235' : undefined }}>
                  <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: '#1e2235' }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded" style={{ backgroundColor: '#1e2235', width: '60%' }} />
                    <div className="h-2.5 rounded" style={{ backgroundColor: '#1e2235', width: '40%' }} />
                  </div>
                  <div className="h-6 w-16 rounded-xl" style={{ backgroundColor: '#1e2235' }} />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl px-6"
              style={{ backgroundColor: 'rgba(10,10,10,0.82)', backdropFilter: 'blur(2px)' }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#a78bfa20' }}>
                <Eye size={22} style={{ color: '#a78bfa' }} />
              </div>
              <div className="text-center space-y-1">
                <p className="font-black uppercase text-lg leading-tight"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', letterSpacing: '0.04em' }}>
                  {coachViewers.length > 0
                    ? `${coachViewers.length} coach${coachViewers.length > 1 ? 'es' : ''} already checked you out`
                    : `${viewers.length} person${viewers.length > 1 ? 's' : ''} viewed your profile`}
                </p>
                <p className="text-sm" style={{ color: '#8892aa' }}>
                  Go Premium to see who — then message them first.
                </p>
              </div>
              <div className="w-full space-y-2 text-left">
                {[
                  'See exactly who viewed your profile',
                  'Message coaches who noticed you',
                  '3 conversations/month included',
                  'Buy more slots if you need them',
                ].map(point => (
                  <div key={point} className="flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: '#2d5fc420' }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="text-xs" style={{ color: '#e8dece' }}>{point}</span>
                  </div>
                ))}
              </div>
              <Link href="/dashboard/player/premium"
                className="w-full text-center py-3 rounded-2xl text-sm font-bold uppercase tracking-wider"
                style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                Go Premium · £6.99/mo
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
