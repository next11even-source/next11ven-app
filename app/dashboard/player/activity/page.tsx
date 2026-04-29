'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Briefcase, Check, Eye, Heart, MessageCircle, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { timeAgo } from '@/lib/utils'
import { useSidebar } from '../_components/SidebarContext'

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoute(type: string): string {
  switch (type) {
    case 'post_like':
    case 'post_comment':
    case 'post_interest': return '/dashboard/feed'
    case 'new_opportunity':  return '/dashboard/player/opportunities'
    default:                 return '/dashboard/player/activity'
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

// ─── Notification type icon (fallback when no actor avatar) ───────────────────

function TypeIcon({ type }: { type: string }) {
  const cfg: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
    post_like:      { icon: <Heart size={14} fill="currentColor" />, bg: '#ef444420', color: '#ef4444' },
    post_comment:   { icon: <MessageCircle size={14} />,             bg: '#2d5fc420', color: '#4d8ae8' },
    post_interest:  { icon: <Star size={14} fill="currentColor" />,  bg: '#f59e0b20', color: '#f59e0b' },
    profile_view:   { icon: <Eye size={14} />,                       bg: '#a78bfa20', color: '#a78bfa' },
    new_opportunity:{ icon: <Briefcase size={14} />,                 bg: '#f59e0b20', color: '#f59e0b' },
  }
  const c = cfg[type] ?? { icon: <Bell size={14} />, bg: '#1e2235', color: '#8892aa' }
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: c.bg, color: c.color }}>
      {c.icon}
    </div>
  )
}

// ─── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ url, name }: { url: string | null; name: string | null }) {
  if (url) return (
    <img src={url} alt={name ?? ''} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
  )
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
      style={{ backgroundColor: '#1e2235', color: '#8892aa' }}>
      {getInitials(name)}
    </div>
  )
}

// ─── Notification Row ─────────────────────────────────────────────────────────

function NotifRow({ notif, onRead }: { notif: Notification; onRead: (id: string) => void }) {
  const router = useRouter()

  function handleTap() {
    onRead(notif.id)
    router.push(getRoute(notif.type))
  }

  const hideActor = notif.type === 'post_interest' || notif.type === 'new_opportunity'

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
      {hideActor
        ? <TypeIcon type={notif.type} />
        : notif.actor?.avatar_url || notif.actor?.full_name
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

// ─── Notifications section ────────────────────────────────────────────────────

function NotificationsSection({
  notifications,
  onMarkAll,
  onRead,
}: {
  notifications: Notification[]
  onMarkAll: () => void
  onRead: (id: string) => void
}) {
  const hasUnread = notifications.some(n => !n.is_read)
  const { today, week, earlier } = groupByDate(notifications)

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
        <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <Check size={24} style={{ color: '#8892aa' }} />
        </div>
        <p className="font-bold uppercase"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, color: '#e8dece', letterSpacing: '0.04em' }}>
          You&apos;re all caught up
        </p>
        <p className="mt-1 text-sm" style={{ color: '#8892aa' }}>
          Likes, comments and coach interest will appear here.
        </p>
      </div>
    )
  }

  const groups = [
    { label: 'Today', items: today },
    { label: 'This Week', items: week },
    { label: 'Earlier', items: earlier },
  ].filter(g => g.items.length > 0)

  return (
    <div className="space-y-4">
      {hasUnread && (
        <div className="flex justify-end px-4">
          <button onClick={onMarkAll}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ border: '1px solid #1e2235', color: '#e8dece', backgroundColor: 'transparent' }}>
            Mark all as read
          </button>
        </div>
      )}
      {groups.map(group => (
        <div key={group.label}>
          <p className="px-4 pb-2 text-xs font-bold uppercase tracking-wider" style={{ color: '#4b5563' }}>
            {group.label}
          </p>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
            {group.items.map((n, i) => (
              <div key={n.id} style={{ borderBottom: i < group.items.length - 1 ? '1px solid #1e2235' : undefined }}>
                <NotifRow notif={n} onRead={onRead} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Profile Views section (preserved) ───────────────────────────────────────

function ProfileViewsSection({ views, isPremium }: { views: ViewerGroup[]; isPremium: boolean }) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const coachViewers = views.filter(v => v.role === 'coach')

  return (
    <div className="space-y-3">
      <h2 className="px-4 text-base font-black uppercase"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
        Profile Views
      </h2>

      {views.length === 0 ? (
        <div className="mx-0 rounded-2xl p-8 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>No profile views yet — keep your profile updated to get noticed.</p>
          <Link href="/dashboard/player/profile"
            className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
            Complete My Profile
          </Link>
        </div>
      ) : isPremium ? (
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
          {views.map((v, i) => {
            const isCoach = v.role === 'coach'
            const initials = v.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
            return (
              <div key={v.viewer_id} className="flex items-center gap-3 px-4 py-3.5"
                style={{ backgroundColor: '#13172a', borderBottom: i < views.length - 1 ? '1px solid #1e2235' : undefined, minHeight: 44 }}>
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
        <div className="relative">
          <div className="rounded-2xl overflow-hidden pointer-events-none select-none"
            style={{ border: '1px solid #1e2235', filter: 'blur(4px)', opacity: 0.4 }}>
            {[...Array(Math.min(views.length, 4))].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5"
                style={{ backgroundColor: '#13172a', borderBottom: i < 3 ? '1px solid #1e2235' : undefined }}>
                <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: '#1e2235' }} />
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
                : `${views.length} person${views.length > 1 ? 's' : ''} viewed your profile`}
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

export default function NotificationsPage() {
  const router = useRouter()
  const { openSidebar } = useSidebar()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [viewers, setViewers] = useState<ViewerGroup[]>([])
  const [isPremium, setIsPremium] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/'); return }

      const [notifRes, profileRes, viewsRes] = await Promise.all([
        supabase
          .from('notifications')
          .select('id, type, entity_id, message, is_read, created_at, actor:profiles!actor_id(full_name, avatar_url)')
          .eq('recipient_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('profiles').select('premium').eq('id', user.id).single(),
        supabase.from('player_views')
          .select('id, viewer_id, viewed_at, viewer:viewer_id(full_name, club, role, avatar_url)')
          .eq('player_id', user.id)
          .order('viewed_at', { ascending: false })
          .limit(200),
      ])

      // Normalise actor (Supabase returns joined rows as arrays)
      const rawNotifs = (notifRes.data as any[]) ?? []
      setNotifications(rawNotifs.map(n => ({
        ...n,
        actor: Array.isArray(n.actor) ? (n.actor[0] ?? null) : n.actor,
      })))

      // Mark all unseen as read in the background — badge clears on next nav mount
      if (rawNotifs.some((n: any) => !n.is_read)) {
        supabase.from('notifications')
          .update({ is_read: true })
          .eq('recipient_id', user.id)
          .eq('is_read', false)
          .then(() => {})
      }

      setIsPremium(profileRes.data?.premium ?? false)

      // Deduplicate viewers
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

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  }, [])

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).eq('is_read', false)
  }, [])

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
          Notifications
        </h1>
        <div style={{ width: 20 }} />
      </div>

      {loading ? <Skeleton /> : (
        <div className="px-4 py-4 space-y-8">
          <NotificationsSection
            notifications={notifications}
            onMarkAll={markAllRead}
            onRead={markRead}
          />
          <ProfileViewsSection views={viewers} isPremium={isPremium} />
        </div>
      )}
    </div>
  )
}
