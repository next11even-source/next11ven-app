'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { timeAgo } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileViewer = {
  viewer_id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  club: string | null
  status: string | null
  count: number
  last_viewed: string
}

const STATUS_COLORS: Record<string, string> = {
  free_agent:    '#60a5fa',
  signed:        '#8892aa',
  loan_dual_reg: '#a78bfa',
  just_exploring:'#f59e0b',
}

const STATUS_LABELS: Record<string, string> = {
  free_agent:    'Free Agent',
  signed:        'Signed',
  loan_dual_reg: 'Loan / Dual Reg',
  just_exploring:'Just Exploring',
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

function getInitials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoachProfileViewsPage() {
  const router = useRouter()
  const [viewers, setViewers] = useState<ProfileViewer[]>([])
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }

      const [profileRes, viewsRes] = await Promise.all([
        supabase.from('profiles').select('premium').eq('id', user.id).single(),
        supabase
          .from('player_views')
          .select('viewer_id, viewed_at, viewer:profiles!viewer_id(full_name, avatar_url, position, club, status)')
          .eq('player_id', user.id)
          .order('viewed_at', { ascending: false })
          .limit(200),
      ])

      setIsPremium(profileRes.data?.premium ?? false)

      const rawViews = (viewsRes.data as any[]) ?? []
      const viewerMap = new Map<string, ProfileViewer>()
      for (const v of rawViews) {
        const viewer = Array.isArray(v.viewer) ? (v.viewer[0] ?? null) : v.viewer
        const existing = viewerMap.get(v.viewer_id)
        if (!existing) {
          viewerMap.set(v.viewer_id, {
            viewer_id: v.viewer_id,
            full_name: viewer?.full_name ?? null,
            avatar_url: viewer?.avatar_url ?? null,
            position: viewer?.position ?? null,
            club: viewer?.club ?? null,
            status: viewer?.status ?? null,
            count: 1,
            last_viewed: v.viewed_at,
          })
        } else {
          existing.count++
          if (v.viewed_at > existing.last_viewed) existing.last_viewed = v.viewed_at
        }
      }
      setViewers(Array.from(viewerMap.values()).sort((a, b) => new Date(b.last_viewed).getTime() - new Date(a.last_viewed).getTime()))
      setLoading(false)
    })
  }, [router])

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 flex items-center gap-3"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <button onClick={() => router.back()} className="flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0"
          style={{ backgroundColor: '#13172a' }}>
          <ArrowLeft size={16} style={{ color: '#e8dece' }} />
        </button>
        <h1 className="flex-1 text-base font-black uppercase tracking-widest"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          Profile Views
        </h1>
        {viewers.length > 0 && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>
            {viewers.length}
          </span>
        )}
      </div>

      {loading ? <Skeleton /> : viewers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
            style={{ backgroundColor: '#f59e0b20' }}>
            <Eye size={24} style={{ color: '#f59e0b' }} />
          </div>
          <p className="font-bold uppercase"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, color: '#e8dece', letterSpacing: '0.04em' }}>
            No views yet
          </p>
          <p className="mt-1 text-sm" style={{ color: '#8892aa' }}>
            Keep your opportunities updated to attract players.
          </p>
        </div>
      ) : isPremium ? (
        <div className="px-4 py-4">
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            {viewers.map((v, i) => {
              const initials = getInitials(v.full_name)
              return (
                <div key={v.viewer_id} className="flex items-center gap-3 px-4 py-3.5"
                  style={{ backgroundColor: '#13172a', borderBottom: i < viewers.length - 1 ? '1px solid #1e2235' : undefined, minHeight: 44 }}>
                  <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: '#1e2235' }}>
                    {v.avatar_url
                      ? <img src={v.avatar_url} alt="" className="w-full h-full object-cover" />
                      : <span className="text-xs font-bold" style={{ color: '#2d5fc4' }}>{initials}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: '#e8dece' }}>{v.full_name ?? 'Unknown'}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: '#8892aa' }}>
                      {[v.position, v.club].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {v.status && (
                      <p className="text-xs font-semibold mt-0.5" style={{ color: STATUS_COLORS[v.status] ?? '#8892aa', fontSize: 10 }}>
                        {STATUS_LABELS[v.status] ?? v.status}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-xs" style={{ color: '#4b5563' }}>{timeAgo(v.last_viewed)}</span>
                    {v.count > 1 && (
                      <span className="text-xs font-bold" style={{ color: '#2d5fc4' }}>{v.count}×</span>
                    )}
                    <Link
                      href={`/dashboard/player/players/${v.viewer_id}`}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                      style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                      View
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        // Free coach — blurred list + upgrade prompt
        <div className="px-4 py-4">
          <div className="relative">
            <div className="rounded-2xl overflow-hidden pointer-events-none select-none"
              style={{ border: '1px solid #1e2235', filter: 'blur(5px)', opacity: 0.35 }}>
              {[...Array(Math.min(viewers.length, 5))].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5"
                  style={{ backgroundColor: '#13172a', borderBottom: i < 4 ? '1px solid #1e2235' : undefined }}>
                  <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: '#1e2235' }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded" style={{ backgroundColor: '#1e2235', width: '55%' }} />
                    <div className="h-2.5 rounded" style={{ backgroundColor: '#1e2235', width: '38%' }} />
                    <div className="h-2 rounded" style={{ backgroundColor: '#1e2235', width: '25%' }} />
                  </div>
                  <div className="h-6 w-12 rounded-lg" style={{ backgroundColor: '#1e2235' }} />
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl"
              style={{ backgroundColor: 'rgba(10,10,10,0.8)', backdropFilter: 'blur(2px)' }}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#f59e0b20' }}>
                <Eye size={26} style={{ color: '#f59e0b' }} />
              </div>
              <div className="text-center px-6 space-y-1.5">
                <p className="font-black uppercase text-lg"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', letterSpacing: '0.04em' }}>
                  {viewers.length} player{viewers.length > 1 ? 's' : ''} viewed your profile
                </p>
                <p className="text-sm" style={{ color: '#8892aa' }}>
                  Upgrade to Coach Pro to see who&apos;s checking you out and view their full profile.
                </p>
              </div>
              <Link href="/dashboard/coach/premium"
                className="px-6 py-3 rounded-full text-sm font-bold uppercase tracking-wider"
                style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                Upgrade to Coach Pro · £9.99/mo
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
