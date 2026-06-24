'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Bookmark, Briefcase, Check, ChevronRight, Eye, Heart, LayoutList, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import CoachSidebar from '@/app/dashboard/coach/_components/CoachSidebar'
import { timeAgo } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type Notification = {
  id: string
  type: string
  entity_id: string | null
  message: string
  is_read: boolean
  created_at: string
  actor: { full_name: string | null; avatar_url: string | null } | null
}

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

type CoachProfile = {
  full_name: string | null
  avatar_url: string | null
  coaching_role: string | null
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoute(type: string, entityId?: string | null): string {
  switch (type) {
    case 'post_like':
    case 'post_comment':
    case 'shortlist_post':               return '/dashboard/feed'
    case 'new_opportunity_application':  return '/dashboard/opportunities'
    case 'shortlist_availability':
      return entityId
        ? `/dashboard/player/players/${entityId}?compose=1`
        : '/dashboard/coach/shortlists'
    default:                             return '/dashboard/coach'
  }
}

function groupByDate(items: Notification[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const weekAgo = new Date(today.getTime() - 6 * 86400000)
  return {
    today:   items.filter(n => new Date(n.created_at) >= today),
    week:    items.filter(n => { const d = new Date(n.created_at); return d >= weekAgo && d < today }),
    earlier: items.filter(n => new Date(n.created_at) < weekAgo),
  }
}

function getInitials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Type icon ────────────────────────────────────────────────────────────────

function TypeIcon({ type }: { type: string }) {
  const cfg: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
    post_like:                   { icon: <Heart size={14} fill="currentColor" />, bg: '#ef444420', color: '#ef4444' },
    post_comment:                { icon: <MessageCircle size={14} />,            bg: '#2d5fc420', color: '#4d8ae8' },
    new_opportunity_application: { icon: <Briefcase size={14} />,               bg: '#f59e0b20', color: '#f59e0b' },
    shortlist_post:              { icon: <LayoutList size={14} />,               bg: '#2d5fc420', color: '#4d8ae8' },
    shortlist_availability:      { icon: <Bookmark size={14} />,                bg: '#a78bfa20', color: '#a78bfa' },
  }
  const c = cfg[type] ?? { icon: <Bell size={14} />, bg: '#1e2235', color: '#8892aa' }
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: c.bg, color: c.color }}>
      {c.icon}
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ url, name, size = 40 }: { url: string | null; name: string | null; size?: number }) {
  if (url) return (
    <img src={url} alt={name ?? ''} className="rounded-full object-cover flex-shrink-0"
      style={{ width: size, height: size }} />
  )
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
      style={{ width: size, height: size, backgroundColor: '#1e2235', color: '#8892aa' }}>
      {getInitials(name)}
    </div>
  )
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotifRow({ notif, onRead }: { notif: Notification; onRead: (id: string) => void }) {
  const router = useRouter()

  function handleTap() {
    onRead(notif.id)
    router.push(getRoute(notif.type, notif.entity_id))
  }

  return (
    <button
      onClick={handleTap}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
      style={{
        backgroundColor: notif.is_read ? '#13172a' : '#141a2e',
        borderLeft: notif.is_read ? '3px solid transparent' : '3px solid #2d5fc4',
        minHeight: 44,
      }}
    >
      {notif.actor?.avatar_url || notif.actor?.full_name
        ? <Avatar url={notif.actor.avatar_url} name={notif.actor.full_name} />
        : <TypeIcon type={notif.type} />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug"
          style={{ color: '#e8dece', fontFamily: "'Inter', sans-serif", fontWeight: notif.is_read ? 400 : 600 }}>
          {notif.message}
        </p>
      </div>
      <span className="text-xs flex-shrink-0 ml-1" style={{ color: '#4b5563' }}>
        {timeAgo(notif.created_at)}
      </span>
    </button>
  )
}

// ─── Profile Views summary button ────────────────────────────────────────────

function ProfileViewsButton({ viewers, isPremium }: { viewers: ProfileViewer[]; isPremium: boolean }) {
  const total = viewers.length

  let subtitle = 'No views yet'
  if (total > 0 && isPremium) {
    subtitle = `${total} player${total > 1 ? 's' : ''} viewed your profile`
  } else if (total > 0) {
    subtitle = `${total} player${total > 1 ? 's' : ''} viewed your profile`
  }

  return (
    <Link
      href="/dashboard/coach/notifications/profile-views"
      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl w-full"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none' }}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>
        <Eye size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>Profile Views</p>
        <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{subtitle}</p>
      </div>
      {total > 0 && (
        <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: '#f59e0b20', color: '#f59e0b' }}>
          {total}
        </span>
      )}
      <ChevronRight size={16} style={{ color: '#4b5563', flexShrink: 0 }} />
    </Link>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4 px-4 py-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: '#1e2235' }} />
          <div className="flex-1 space-y-2">
            <div className="h-3 rounded" style={{ backgroundColor: '#1e2235', width: '70%' }} />
            <div className="h-2.5 rounded" style={{ backgroundColor: '#1e2235', width: '45%' }} />
          </div>
          <div className="h-2.5 w-8 rounded" style={{ backgroundColor: '#1e2235' }} />
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CoachNotificationsPage() {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [coachProfile, setCoachProfile] = useState<CoachProfile | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [viewers, setViewers] = useState<ProfileViewer[]>([])
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      setUserId(user.id)

      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

      const [profileRes, notifRes, viewsRes] = await Promise.all([
        supabase.from('profiles').select('full_name, avatar_url, coaching_role, premium').eq('id', user.id).single(),
        supabase
          .from('notifications')
          .select('id, type, entity_id, message, is_read, created_at, actor:profiles!actor_id(full_name, avatar_url)')
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('player_views')
          .select('viewer_id, viewed_at, viewer:profiles!viewer_id(full_name, avatar_url, position, club, status)')
          .eq('player_id', user.id)
          .eq('viewer_role', 'player')
          .gte('viewed_at', weekAgo)
          .order('viewed_at', { ascending: false }),
      ])

      setCoachProfile(profileRes.data ?? null)
      setIsPremium(profileRes.data?.premium ?? false)

      const raw = (notifRes.data as any[]) ?? []
      setNotifications(raw.map(n => ({
        ...n,
        actor: Array.isArray(n.actor) ? (n.actor[0] ?? null) : n.actor,
      })))

      // Mark all unseen as read in the background
      if (raw.some((n: any) => !n.is_read)) {
        supabase.from('notifications')
          .update({ is_read: true })
          .eq('recipient_id', user.id)
          .eq('is_read', false)
          .then(() => {})
      }

      // Deduplicate viewers — keep most recent visit per person
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
      setViewers(Array.from(viewerMap.values()))

      setLoading(false)
    })
  }, [router])

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  }, [])

  const markAllRead = useCallback(async () => {
    if (!userId) return
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true })
      .eq('recipient_id', userId)
      .eq('is_read', false)
  }, [userId])

  const hasUnread = notifications.some(n => !n.is_read)
  const { today, week, earlier } = groupByDate(notifications)
  const groups = [
    { label: 'Today', items: today },
    { label: 'This Week', items: week },
    { label: 'Earlier', items: earlier },
  ].filter(g => g.items.length > 0)

  return (
    <>
      <CoachSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={coachProfile} />

      <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
        {/* Header */}
        <div
          className="sticky top-0 z-10 px-4 pt-4 pb-3 flex items-center justify-between"
          style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}
        >
          <button onClick={() => setSidebarOpen(true)} className="flex-shrink-0 p-1 -ml-1" style={{ color: '#8892aa' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <h1 className="text-base font-black uppercase tracking-widest"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Notifications
          </h1>
          {hasUnread && !loading ? (
            <button onClick={markAllRead}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ border: '1px solid #1e2235', color: '#e8dece', backgroundColor: 'transparent' }}>
              Mark all read
            </button>
          ) : (
            <div style={{ width: 88 }} />
          )}
        </div>

        {loading ? <Skeleton /> : (
          <div className="px-4 py-4 space-y-4">
            <ProfileViewsButton viewers={viewers} isPremium={isPremium} />

            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-8 text-center">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                  <Check size={24} style={{ color: '#8892aa' }} />
                </div>
                <p className="font-bold uppercase"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, color: '#e8dece', letterSpacing: '0.04em' }}>
                  All caught up
                </p>
                <p className="mt-1 text-sm" style={{ color: '#8892aa' }}>
                  Applications, shortlist updates and post activity will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {groups.map(group => (
                  <div key={group.label}>
                    <p className="pb-2 text-xs font-bold uppercase tracking-wider" style={{ color: '#4b5563' }}>
                      {group.label}
                    </p>
                    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
                      {group.items.map((n, i) => (
                        <div key={n.id} style={{ borderBottom: i < group.items.length - 1 ? '1px solid #1e2235' : undefined }}>
                          <NotifRow notif={n} onRead={markRead} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
