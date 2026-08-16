import { useEffect, useMemo, useState } from 'react'
import { timeAgo } from '@/lib/utils'
import type { EventType, FeedEvent } from './types'
import { LoadingCard } from './ui'

const PAGE_SIZE = 25

const TYPE_META: Record<EventType, { label: string; color: string }> = {
  application_accepted: { label: 'Accepted', color: '#2d5fc4' },
  conversation_started: { label: 'Conversation started', color: '#8892aa' },
  conversation_engaged: { label: 'Conversation engaged (3+ msgs)', color: '#38bdf8' },
  // Green here isn't the analytics-growth carve-out — a player marking
  // themselves signed is a positive confirmation in the original brand-rule
  // sense, same family as the Actively Looking dot.
  player_signed: { label: 'Signed', color: '#22c55e' },
  coach_upgraded: { label: 'Coach upgrade', color: '#a78bfa' },
  player_upgraded: { label: 'Player upgrade', color: '#2d5fc4' },
}

const FILTER_OPTIONS: { value: EventType | 'all'; label: string }[] = [
  { value: 'all', label: 'All events' },
  { value: 'application_accepted', label: 'Accepted' },
  { value: 'conversation_started', label: 'Conversations started' },
  { value: 'conversation_engaged', label: 'Conversations engaged (3+ msgs)' },
  { value: 'player_signed', label: 'Signed' },
  { value: 'coach_upgraded', label: 'Coach upgrades' },
  { value: 'player_upgraded', label: 'Player upgrades' },
]

/**
 * Layer 4 — the qualitative window. Reverse-chronological, filterable by
 * type: how the founder sees the marketplace working and spots the
 * connections worth turning into content, not a KPI.
 *
 * Self-fetching and paginated: only loads PAGE_SIZE events up front (this
 * query unions 5 sources including a window function over all messages —
 * not free), with "Load more" fetching further pages on demand rather than
 * always pulling everything in the 90-day window. The type filter only
 * filters events already loaded, so switching to a rare type may need a
 * "Load more" tap or two before it has anything to show.
 */
export function EventFeedTab() {
  const [filter, setFilter] = useState<EventType | 'all'>('all')
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/event-feed?limit=${PAGE_SIZE}&offset=0`)
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => {
        setEvents(d.events ?? [])
        setHasMore(Boolean(d.hasMore))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function loadMore() {
    setLoadingMore(true)
    fetch(`/api/admin/event-feed?limit=${PAGE_SIZE}&offset=${events.length}`)
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json() })
      .then(d => {
        setEvents(prev => [...prev, ...(d.events ?? [])])
        setHasMore(Boolean(d.hasMore))
        setLoadingMore(false)
      })
      .catch(() => setLoadingMore(false))
  }

  const filtered = useMemo(() => {
    return filter === 'all' ? events : events.filter(e => e.type === filter)
  }, [events, filter])

  return (
    <div className="px-4 pt-4 space-y-3">
      <select
        value={filter}
        onChange={e => setFilter(e.target.value as EventType | 'all')}
        className="w-full rounded-lg px-3 py-2 text-xs outline-none"
        style={{ backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }}
      >
        {FILTER_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {loading ? (
        <LoadingCard />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-xs" style={{ color: '#8892aa' }}>
            {events.length === 0 ? 'No events in the last 90 days.' : 'None of this type loaded yet — try Load more.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1e2235' }}>
          {filtered.map((event, i) => (
            <div
              key={`${event.type}-${event.occurred_at}-${i}`}
              className="flex items-start gap-3 px-4 py-3"
              style={{
                backgroundColor: '#13172a',
                borderBottom: i < filtered.length - 1 ? '1px solid #1e2235' : 'none',
              }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                style={{ backgroundColor: TYPE_META[event.type].color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: '#e8dece' }}>{event.headline}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>{timeAgo(event.occurred_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider disabled:opacity-60"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235', color: '#8892aa' }}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
