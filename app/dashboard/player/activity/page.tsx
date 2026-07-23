'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, Bookmark, Briefcase, Check, ChevronRight, Eye, Heart, MessageCircle, Star } from 'lucide-react'
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

function getRoute(type: string, entityId: string | null, isPremium: boolean): string {
  switch (type) {
    case 'post_like':
    case 'post_comment':
    case 'post_interest': return '/dashboard/feed'
    case 'new_opportunity': return '/dashboard/opportunities'
    case 'shortlisted':
      return isPremium && entityId
        ? `/dashboard/coach/${entityId}`
        : '/dashboard/player/premium'
    default: return '/dashboard/player/activity'
  }
}

function bucketByDate<T extends { created_at: string }>(items: T[]) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const weekAgo = new Date(today.getTime() - 6 * 86400000)
  return {
    today:   items.filter(n => new Date(n.created_at) >= today),
    week:    items.filter(n => { const d = new Date(n.created_at); return d >= weekAgo && d < today }),
    earlier: items.filter(n => new Date(n.created_at) < weekAgo),
  }
}

// ─── Grouping (Instagram-style: collapse repeats on the same post) ─────────────

// Only likes and comments flood the feed — group those by post. Everything else
// (shortlists, opportunities, interest) stays as its own row.
const GROUPABLE = new Set(['post_like', 'post_comment'])

type Actor = { full_name: string | null; avatar_url: string | null }

type NotifGroup = {
  key: string
  type: string
  entity_id: string | null
  ids: string[]          // every notification id in the group (for mark-as-read)
  actors: Actor[]        // unique actors, most-recent first
  count: number          // total notifications collapsed into this group
  is_read: boolean       // read only when every member is read
  created_at: string     // most recent event
  message: string        // original DB message (used when count === 1)
}

function buildGroups(notifs: Notification[]): NotifGroup[] {
  const map = new Map<string, NotifGroup>()
  const singles: NotifGroup[] = []

  const asGroup = (n: Notification, key: string): NotifGroup => ({
    key,
    type: n.type,
    entity_id: n.entity_id,
    ids: [n.id],
    actors: n.actor ? [n.actor] : [],
    count: 1,
    is_read: n.is_read,
    created_at: n.created_at,
    message: n.message,
  })

  // notifs arrive newest-first, so first-seen actor is the most recent
  for (const n of notifs) {
    if (!(GROUPABLE.has(n.type) && n.entity_id)) {
      singles.push(asGroup(n, n.id))
      continue
    }
    const key = `${n.type}:${n.entity_id}`
    const ex = map.get(key)
    if (!ex) { map.set(key, asGroup(n, key)); continue }
    ex.ids.push(n.id)
    ex.count++
    ex.is_read = ex.is_read && n.is_read
    if (n.created_at > ex.created_at) ex.created_at = n.created_at
    if (n.actor?.full_name && !ex.actors.some(a => a.full_name === n.actor!.full_name)) {
      ex.actors.push(n.actor)
    }
  }

  return [...map.values(), ...singles]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

function groupMessage(g: NotifGroup): string {
  if (g.count === 1) return g.message
  const verb = g.type === 'post_comment' ? 'commented on your post' : 'liked your post'
  const names = g.actors.filter(a => a.full_name).map(a => a.full_name as string)
  if (names.length === 0) return `${g.count} people ${verb}`
  if (names.length === 1) return `${names[0]} ${verb}`
  if (names.length === 2) return `${names[0]} and ${names[1]} ${verb}`
  return `${names[0]}, ${names[1]} + ${names.length - 2} others ${verb}`
}

function getInitials(name: string | null) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Notification type icon (fallback when no actor avatar) ───────────────────

function TypeIcon({ type }: { type: string }) {
  const cfg: Record<string, { icon: React.ReactNode; bg: string; color: string }> = {
    post_like:      { icon: <Heart size={14} fill="currentColor" />,    bg: '#ef444420', color: '#ef4444' },
    post_comment:   { icon: <MessageCircle size={14} />,                bg: '#2d5fc420', color: '#4d8ae8' },
    post_interest:  { icon: <Star size={14} fill="currentColor" />,     bg: '#f59e0b20', color: '#f59e0b' },
    profile_view:   { icon: <Eye size={14} />,                          bg: '#a78bfa20', color: '#a78bfa' },
    new_opportunity:{ icon: <Briefcase size={14} />,                    bg: '#f59e0b20', color: '#f59e0b' },
    shortlisted:    { icon: <Bookmark size={14} fill="currentColor" />, bg: '#a78bfa20', color: '#a78bfa' },
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

// ─── Stacked avatars (grouped rows) ───────────────────────────────────────────

function StackedAvatars({ actors }: { actors: Actor[] }) {
  const show = actors.filter(a => a.avatar_url || a.full_name).slice(0, 3)
  if (show.length === 0) return <TypeIcon type="post_like" />
  return (
    <div className="flex items-center flex-shrink-0" style={{ paddingLeft: 2 }}>
      {show.map((a, i) => (
        <div key={i}
          className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center"
          style={{
            marginLeft: i === 0 ? 0 : -12,
            zIndex: show.length - i,
            border: '2px solid #13172a',
            backgroundColor: '#1e2235',
          }}>
          {a.avatar_url
            ? <img src={a.avatar_url} alt={a.full_name ?? ''} className="w-full h-full object-cover" />
            : <span className="text-xs font-bold" style={{ color: '#8892aa' }}>{getInitials(a.full_name)}</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Notification Row (single or grouped) ─────────────────────────────────────

function NotifRow({ group, isPremium, onRead }: { group: NotifGroup; isPremium: boolean; onRead: (ids: string[]) => void }) {
  const router = useRouter()

  function handleTap() {
    onRead(group.ids)
    router.push(getRoute(group.type, group.entity_id, isPremium))
  }

  const isMulti = group.count > 1
  const hideActor = group.type === 'post_interest' || group.type === 'new_opportunity' ||
    (group.type === 'shortlisted' && !isPremium)
  const lead = group.actors[0]

  return (
    <button
      onClick={handleTap}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors"
      style={{
        backgroundColor: group.is_read ? '#13172a' : '#141a2e',
        borderLeft: group.is_read ? '3px solid transparent' : '3px solid #2d5fc4',
        minHeight: 44,
      }}
    >
      {isMulti && !hideActor
        ? <StackedAvatars actors={group.actors} />
        : hideActor
          ? <TypeIcon type={group.type} />
          : lead?.avatar_url || lead?.full_name
            ? <Avatar url={lead.avatar_url} name={lead.full_name} />
            : <TypeIcon type={group.type} />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug"
          style={{ color: '#e8dece', fontFamily: "'Inter', sans-serif", fontWeight: group.is_read ? 400 : 600 }}>
          {groupMessage(group)}
        </p>
      </div>
      <span className="text-xs flex-shrink-0 ml-1" style={{ color: '#4b5563' }}>
        {timeAgo(group.created_at)}
      </span>
    </button>
  )
}

// ─── Notifications section ────────────────────────────────────────────────────

function NotificationsSection({
  notifications,
  isPremium,
  onMarkAll,
  onRead,
}: {
  notifications: Notification[]
  isPremium: boolean
  onMarkAll: () => void
  onRead: (ids: string[]) => void
}) {
  const hasUnread = notifications.some(n => !n.is_read)
  const { today, week, earlier } = bucketByDate(buildGroups(notifications))

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
            {group.items.map((g, i) => (
              <div key={g.key} style={{ borderBottom: i < group.items.length - 1 ? '1px solid #1e2235' : undefined }}>
                <NotifRow group={g} isPremium={isPremium} onRead={onRead} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── This-week summary strip ──────────────────────────────────────────────────

function ActivitySummary({ notifications }: { notifications: Notification[] }) {
  const weekAgo = Date.now() - 7 * 86400000
  const recent = notifications.filter(n => new Date(n.created_at).getTime() >= weekAgo)
  const likes = recent.filter(n => n.type === 'post_like').length
  const comments = recent.filter(n => n.type === 'post_comment').length
  const shortlists = recent.filter(n => n.type === 'shortlisted').length

  const parts: string[] = []
  if (likes) parts.push(`${likes} like${likes > 1 ? 's' : ''}`)
  if (comments) parts.push(`${comments} comment${comments > 1 ? 's' : ''}`)
  if (shortlists) parts.push(`${shortlists} coach${shortlists > 1 ? 'es' : ''} shortlisted you`)
  if (parts.length === 0) return null

  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <span className="text-xs font-bold uppercase tracking-wider flex-shrink-0"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#4b5563', letterSpacing: '0.08em' }}>
        This week
      </span>
      <span className="text-sm truncate" style={{ color: '#e8dece' }}>{parts.join(' · ')}</span>
    </div>
  )
}

// ─── Profile Views summary button ────────────────────────────────────────────

function ProfileViewsButton({ views, isPremium }: { views: ViewerGroup[]; isPremium: boolean }) {
  const coachCount = views.filter(v => v.role === 'coach').length
  const total = views.length

  let subtitle = 'No views yet'
  if (total > 0 && isPremium) {
    subtitle = coachCount > 0
      ? `${coachCount} coach${coachCount > 1 ? 'es' : ''} · ${total} total`
      : `${total} viewer${total > 1 ? 's' : ''}`
  } else if (total > 0) {
    subtitle = coachCount > 0
      ? `${coachCount} coach${coachCount > 1 ? 'es' : ''} viewed your profile`
      : `${total} person${total > 1 ? 's' : ''} viewed your profile`
  }

  return (
    <Link
      href="/dashboard/player/activity/profile-views"
      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl w-full"
      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', textDecoration: 'none' }}
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: '#a78bfa20', color: '#a78bfa' }}>
        <Eye size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: '#e8dece' }}>Profile Views</p>
        <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{subtitle}</p>
      </div>
      {total > 0 && (
        <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: '#a78bfa20', color: '#a78bfa' }}>
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

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    setNotifications(prev => prev.map(n => idSet.has(n.id) ? { ...n, is_read: true } : n))
    const supabase = createClient()
    await supabase.from('notifications').update({ is_read: true }).in('id', ids)
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
        <div className="px-4 py-4 space-y-4">
          <ProfileViewsButton views={viewers} isPremium={isPremium} />
          <ActivitySummary notifications={notifications} />
          <NotificationsSection
            notifications={notifications}
            isPremium={isPremium}
            onMarkAll={markAllRead}
            onRead={markRead}
          />
        </div>
      )}
    </div>
  )
}
