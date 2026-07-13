'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { timeAgo } from '@/lib/utils'
import { useSidebar } from '@/app/dashboard/player/_components/SidebarContext'
import { LevelBadge, ClubCrest } from '@/app/components/OpportunityBadges'
import { getLevelConfig } from '@/lib/opportunityLevel'
import { sortLevels } from '@/lib/levels'
import { getOpportunityRelevanceScore, isCloseMatch } from '@/lib/opportunityRelevance'

// ─── Types ────────────────────────────────────────────────────────────────────

type Opportunity = {
  id: string
  coach_id: string
  title: string
  club: string | null
  location: string | null
  position: string | null
  level: string | null
  description: string | null
  urgent: boolean
  deadline: string | null
  created_at: string
  application_count: number
}

type Application = {
  id: string
  status: string
  created_at: string
  opportunity: {
    id: string
    title: string
    club: string | null
    location: string | null
    position: string | null
    level: string | null
    is_active: boolean
  } | null
}

type PlayerProfile = {
  id: string
  city: string | null
  location: string | null
  position: string | null
  secondary_position: string | null
  playing_level: string | null
  premium: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isRecent(d: string) { return Date.now() - new Date(d).getTime() < 48 * 3600000 }
function daysLeft(d: string) { return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) }

// Compact relative timestamp for the list card ("3h", "23h", "3d") — distinct
// from lib/utils timeAgo, which appends " ago" and is used elsewhere.
function compactTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Football position / club abbreviations that should stay uppercase when a
// free-text title is converted to sentence case.
const KNOWN_ACRONYMS = new Set([
  'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'CF', 'ST',
  'FC', 'AFC', 'U18', 'U21', 'U23',
])

// Coach-entered titles are often ALL CAPS free text. Convert to sentence case
// for display only (never mutates stored data), preserving known position /
// club acronyms and any punctuation (including em dashes) untouched.
function toSentenceCase(text: string): string {
  if (!text) return text
  return text.split(' ').map((word, i) => {
    const core = word.replace(/[^A-Za-z0-9]/g, '')
    if (core.length > 1 && KNOWN_ACRONYMS.has(core.toUpperCase())) return word.toUpperCase()
    const lower = word.toLowerCase()
    if (i === 0 && lower) return lower.charAt(0).toUpperCase() + lower.slice(1)
    return lower
  }).join(' ')
}

type PrimarySignal = { key: string; label: string; color: string; bg: string; pulse?: boolean }

// Single highest-priority status signal for the compact card, in this order:
// Urgent > Be first to apply / Just posted > Only N applied > Xd left.
// Within tier 2, "Be first to apply" wins over "Just posted" when both apply,
// since zero applicants is the stronger signal for the player.
function getPrimarySignal(opp: { urgent: boolean; created_at: string; application_count: number; deadline: string | null }): PrimarySignal | null {
  if (opp.urgent) return { key: 'urgent', label: '🔴 Urgent', color: '#f87171', bg: 'rgba(239,68,68,0.12)', pulse: true }
  if (opp.application_count === 0) return { key: 'be_first', label: '🚀 Be first to apply', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' }
  if (isRecent(opp.created_at)) return { key: 'just_posted', label: '⚡ Just posted', color: '#4d8ae8', bg: 'rgba(45,95,196,0.12)' }
  if (opp.application_count < 5) return { key: 'low_applicants', label: `👥 Only ${opp.application_count} applied`, color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' }
  const deadlineDays = opp.deadline ? daysLeft(opp.deadline) : null
  if (deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 14) return { key: 'deadline', label: `⏳ ${deadlineDays}d left`, color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' }
  return null
}

function Chip({ children, color, bg, pulse }: { children: React.ReactNode; color: string; bg: string; pulse?: boolean }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${pulse ? 'animate-pulse' : ''}`}
      style={{ color, backgroundColor: bg }}>
      {children}
    </span>
  )
}

const APP_STATUS: Record<string, { color: string; bg: string; label: string }> = {
  pending:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Pending' },
  viewed:      { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'Viewed' },
  shortlisted: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'Shortlisted' },
  accepted:    { color: '#2d5fc4', bg: 'rgba(45,95,196,0.15)',   label: '✓ Accepted' },
  rejected:    { color: '#8892aa', bg: 'rgba(136,146,170,0.1)',  label: 'Not Progressed' },
}

function SkeletonRow() {
  return (
    <div className="rounded-2xl p-4 space-y-3 animate-pulse" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="h-4 rounded w-48" style={{ backgroundColor: '#1e2235' }} />
      <div className="h-3 rounded w-64" style={{ backgroundColor: '#1e2235' }} />
      <div className="flex gap-2">
        <div className="h-5 w-16 rounded-full" style={{ backgroundColor: '#1e2235' }} />
        <div className="h-5 w-20 rounded-full" style={{ backgroundColor: '#1e2235' }} />
      </div>
    </div>
  )
}

// Compact "Open Roles" list card. Whole header is the tap target: premium
// players expand the inline apply form (existing flow, untouched); free
// players are routed to the existing premium paywall link — same gating as
// before, just triggered from the card instead of a full-width button.
function PlayerOpportunityCard({
  opp, isPremium, applied, isApplying, highlighted, message, onMessageChange, onTap, onCancel, onConfirm, anchorId = true,
}: {
  opp: Opportunity
  isPremium: boolean
  applied: boolean
  isApplying: boolean
  highlighted: boolean
  message: string
  onMessageChange: (v: string) => void
  onTap: () => void
  onCancel: () => void
  // Set false for a duplicate render of the same opportunity (e.g. the "Best
  // matches" preview) so it doesn't collide with the main list's anchor id.
  anchorId?: boolean
  onConfirm: () => void
}) {
  const signal = getPrimarySignal(opp)
  const level = getLevelConfig(opp.level)
  const club = isPremium ? opp.club : null
  const meta = [club, opp.location].filter(Boolean).join(' · ')
  const title = toSentenceCase(opp.title)

  const rightLabel = applied ? '✓ Applied' : isPremium ? 'Apply →' : '🔒 Premium →'
  const ariaLabel = applied
    ? `Already applied to ${title}`
    : isPremium
      ? `Apply to ${title}${meta ? ` at ${meta}` : ''}`
      : `Upgrade to premium to view club details and apply to ${title}`

  const header = (
    <div style={{ padding: '13px 14px' }}>
      <div className="flex gap-2.5">
        <span aria-hidden="true"><ClubCrest club={club} size={34} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-bold truncate"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', fontSize: 16, lineHeight: 1.2 }}>
              {title}
            </h3>
            <span className="flex-shrink-0" style={{ fontSize: 11, color: '#5b6478', paddingTop: 2 }}>
              {compactTimeAgo(opp.created_at)}
            </span>
          </div>
          <p className="truncate mt-0.5" style={{ fontSize: 12, color: '#8892aa' }}>{meta || 'Details to follow'}</p>
          <div className="flex items-center gap-1.5 mt-1.5 overflow-hidden">
            <Chip color={level.color} bg={level.bg}>{level.line1}{level.line2 ? ` ${level.line2}` : ''}</Chip>
            {opp.position && <Chip color="#60a5fa" bg="rgba(96,165,250,0.12)">{opp.position.toUpperCase()}</Chip>}
            {signal && <Chip color={signal.color} bg={signal.bg} pulse={signal.pulse}>{signal.label}</Chip>}
            <span className="ml-auto flex-shrink-0 text-xs font-bold" style={{ color: applied || isPremium ? '#2d5fc4' : '#8892aa' }}>
              {rightLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div id={anchorId ? 'opp-' + opp.id : undefined}
      className="relative rounded-2xl overflow-hidden transition-colors"
      style={{
        backgroundColor: '#13172a',
        border: `1px solid ${applied ? '#2d5fc4' : '#1e2235'}`,
        borderLeft: signal?.key === 'urgent' ? '3px solid #ef4444' : undefined,
        outline: highlighted ? '2px solid #2d5fc4' : 'none',
        outlineOffset: 2,
        scrollMarginTop: 120,
      }}>
      {isPremium ? (
        <button type="button" onClick={onTap} disabled={applied} aria-label={ariaLabel}
          className="w-full text-left disabled:cursor-default" style={{ minHeight: 44 }}>
          {header}
        </button>
      ) : (
        <Link href="/dashboard/player/premium" aria-label={ariaLabel} className="block" style={{ minHeight: 44 }}>
          {header}
        </Link>
      )}

      {isApplying && (
        <div className="space-y-2" style={{ padding: '0 14px 13px' }}>
          <textarea value={message} onChange={e => onMessageChange(e.target.value)} rows={3}
            className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
            style={{ backgroundColor: '#0a0a0a', border: '1px solid #2d5fc4', color: '#e8dece' }}
            placeholder="Tell the coach about yourself (optional)…" />
          <div className="flex gap-2">
            <button onClick={onCancel}
              className="flex-1 rounded-full py-2.5 text-sm font-semibold uppercase"
              style={{ border: '1px solid #1e2235', color: '#8892aa' }}>
              Cancel
            </button>
            <button onClick={onConfirm}
              className="flex-1 rounded-full py-2.5 text-sm font-semibold uppercase"
              style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
              Confirm Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Opportunities Tab ────────────────────────────────────────────────────────

function OpportunitiesTab({ playerId, profile, focusOppId, onFocused }: {
  playerId: string
  profile: PlayerProfile | null
  focusOppId: string | null
  onFocused: () => void
}) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const isPremium = profile?.premium ?? false

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [oppsRes, appsRes, countsRes] = await Promise.all([
        supabase.from('opportunities').select('id, title, club, location, position, level, description, urgent, deadline, opportunity_type, created_at, coach_id').eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('applications').select('opportunity_id').eq('player_id', playerId),
        fetch('/api/opportunities/counts').then(r => r.json()),
      ])
      const opps = (oppsRes.data ?? []) as unknown as Opportunity[]
      const counts: Record<string, number> = countsRes.counts ?? {}
      const withCounts = opps.map(o => ({ ...o, application_count: counts[o.id] ?? 0 }))
      setOpportunities(withCounts)
      setAppliedIds(new Set((appsRes.data ?? []).map((a: { opportunity_id: string }) => a.opportunity_id)))
      setLoading(false)
    }
    load()
  }, [playerId])

  async function handleApply(opp: Opportunity) {
    const res = await fetch('/api/applications/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity_id: opp.id, message: message.trim() || null }),
    })
    if (res.ok) {
      setAppliedIds(prev => new Set([...prev, opp.id]))
      setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, application_count: o.application_count + 1 } : o))
      setApplying(null)
      setMessage('')
    }
  }

  // Relevance score per opportunity, keyed to the viewing player's step,
  // position and location (see lib/opportunityRelevance.ts). A soft ranking
  // signal only — nothing below is ever hidden because of its score.
  const relevance = profile
    ? new Map(opportunities.map(o => [o.id, getOpportunityRelevanceScore(o, profile)]))
    : null
  const scoreOf = (o: Opportunity) => relevance?.get(o.id) ?? 0

  // "Best matches for you" — hard-filtered to the player's own position (or
  // roles open to any position) within one step of their own level (see
  // lib/opportunityRelevance.ts isCloseMatch), then ordered by relevance.
  // Needs both a position and a level on the profile to filter on.
  const hasMatchSignal = !!(profile?.position && profile?.playing_level)
  const topMatches = hasMatchSignal && profile
    ? opportunities.filter(o => isCloseMatch(o, profile)).sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 6)
    : []

  // Filter options + filtering. Club is intentionally excluded from free-player
  // search so the gated club name can't leak via keyword. Stays in the
  // chronological (newest-first) order the initial query already returned —
  // relevance ranking is surfaced only in "Best matches for you" above.
  const levelOptions = sortLevels(Array.from(new Set(opportunities.map(o => o.level).filter(Boolean) as string[])))
  const positionOptions = Array.from(new Set(opportunities.map(o => o.position).filter(Boolean) as string[]))
  const q = search.trim().toLowerCase()
  const filtered = opportunities.filter(o => {
    if (levelFilter && o.level !== levelFilter) return false
    if (positionFilter && o.position !== positionFilter) return false
    if (urgentOnly && !o.urgent) return false
    if (q) {
      const hay = [o.title, o.location, o.position, o.level, o.description, isPremium ? o.club : null].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const hasActiveFilters = !!(q || levelFilter || positionFilter || urgentOnly)
  const selectStyle = { backgroundColor: '#0d1020', border: '1px solid #1e2235', color: '#e8dece' }

  function clearFilters() { setSearch(''); setLevelFilter(''); setPositionFilter(''); setUrgentOnly(false) }

  // Deep-link from "My Applications": clear filters so the target isn't hidden,
  // then scroll to and briefly highlight the role they applied to.
  useEffect(() => {
    if (!focusOppId || loading) return
    const id = focusOppId
    setSearch(''); setLevelFilter(''); setPositionFilter(''); setUrgentOnly(false)
    const t = setTimeout(() => {
      const el = document.getElementById('opp-' + id)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightId(id)
      }
      onFocused()
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusOppId, loading])

  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 2500)
    return () => clearTimeout(t)
  }, [highlightId])

  if (loading) return (
    <div className="space-y-4 px-4 py-4">
      {[0,1,2].map(i => <SkeletonRow key={i} />)}
    </div>
  )

  if (opportunities.length === 0) return (
    <div className="px-4 py-4">
      <div className="rounded-2xl p-10 text-center space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <p className="text-sm" style={{ color: '#8892aa' }}>No opportunities posted yet. Check back soon — coaches post new roles regularly.</p>
        <Link href="/dashboard/player/profile"
          className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold"
          style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
          Update My Profile
        </Link>
      </div>
    </div>
  )

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Best matches for you — soft rank, top of the tab. Same cards as the
          full list below; nothing here is removed from that list. */}
      {topMatches.length >= 1 && (
        <div className="space-y-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#e8dece' }}>
              Best matches for you
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
              Matched to your step and position.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {topMatches.map(opp => (
              <PlayerOpportunityCard key={'match-' + opp.id} opp={opp}
                isPremium={isPremium}
                applied={appliedIds.has(opp.id)}
                isApplying={applying === opp.id}
                highlighted={highlightId === opp.id}
                message={message}
                onMessageChange={setMessage}
                onTap={() => setApplying(opp.id)}
                onCancel={() => { setApplying(null); setMessage('') }}
                onConfirm={() => handleApply(opp)}
                anchorId={false} />
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1" style={{ minWidth: 180 }}>
          <svg className="absolute top-1/2 -translate-y-1/2" style={{ left: 12 }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search roles, areas…"
            className="w-full rounded-full py-2 text-sm outline-none"
            style={{ ...selectStyle, paddingLeft: 34, paddingRight: 12 }}
            onFocus={e => (e.currentTarget.style.borderColor = '#2d5fc4')}
            onBlur={e => (e.currentTarget.style.borderColor = '#1e2235')} />
        </div>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          className="rounded-full px-3 py-2 text-sm outline-none cursor-pointer" style={selectStyle}>
          <option value="">All levels</option>
          {levelOptions.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)}
          className="rounded-full px-3 py-2 text-sm outline-none cursor-pointer" style={selectStyle}>
          <option value="">All positions</option>
          {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={() => setUrgentOnly(v => !v)}
          className="rounded-full px-3.5 py-2 text-sm font-semibold transition-colors flex items-center gap-1.5"
          style={{
            backgroundColor: urgentOnly ? 'rgba(245,158,11,0.15)' : '#0d1020',
            border: `1px solid ${urgentOnly ? '#f59e0b' : '#1e2235'}`,
            color: urgentOnly ? '#f59e0b' : '#8892aa',
          }}>
          🔴 Urgent
        </button>
        {hasActiveFilters && (
          <button onClick={clearFilters}
            className="text-xs uppercase tracking-wider transition-colors" style={{ color: '#8892aa' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e8dece')}
            onMouseLeave={e => (e.currentTarget.style.color = '#8892aa')}>
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl p-10 text-center space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>No roles match your filters.</p>
          <button onClick={clearFilters}
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', color: '#2d5fc4' }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {filtered.map(opp => (
            <PlayerOpportunityCard key={opp.id} opp={opp}
              isPremium={isPremium}
              applied={appliedIds.has(opp.id)}
              isApplying={applying === opp.id}
              highlighted={highlightId === opp.id}
              message={message}
              onMessageChange={setMessage}
              onTap={() => setApplying(opp.id)}
              onCancel={() => { setApplying(null); setMessage('') }}
              onConfirm={() => handleApply(opp)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── My Applications Tab ──────────────────────────────────────────────────────

function ApplicationsTab({ playerId, onView, onBrowse }: {
  playerId: string
  onView: (oppId: string) => void
  onBrowse: () => void
}) {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('applications')
      .select('id, status, created_at, opportunity:opportunity_id(id, title, club, location, position, level, is_active)')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setApplications((data as unknown as Application[]) ?? [])
        setLoading(false)
      })
  }, [playerId])

  if (loading) return (
    <div className="space-y-3 px-4 py-4">
      {[0,1,2].map(i => <SkeletonRow key={i} />)}
    </div>
  )

  return (
    <div className="px-4 py-4">
      {applications.length === 0 ? (
        <div className="rounded-2xl p-10 text-center space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>You haven't applied for any roles yet.</p>
          <button onClick={onBrowse}
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
            Browse Opportunities
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {applications.map(app => {
            const cfg = APP_STATUS[app.status] ?? APP_STATUS.pending
            const opp = app.opportunity
            const showPos = opp?.position && !opp.title?.toLowerCase().includes(opp.position.toLowerCase())
            const meta = [opp?.club, opp?.location, showPos ? opp?.position : null].filter(Boolean).join(' · ')
            return (
              <div key={app.id} className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <div className="p-4 lg:p-5">
                  <div className="flex gap-3.5">
                    <LevelBadge level={opp?.level ?? null} size={44} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold uppercase truncate"
                          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', fontSize: 19, lineHeight: 1.1 }}>
                          {opp?.title ?? 'Opportunity'}
                        </h3>
                        <span className="text-xs px-2.5 py-1 rounded-full font-semibold flex-shrink-0"
                          style={{ color: cfg.color, backgroundColor: cfg.bg }}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs mt-1 truncate" style={{ color: '#8892aa' }}>{meta || '—'}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#5b6478' }}>Applied {timeAgo(app.created_at)}</p>

                      {opp && opp.is_active ? (
                        <button onClick={() => onView(opp.id)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors"
                          style={{ backgroundColor: 'rgba(45,95,196,0.12)', border: '1px solid rgba(45,95,196,0.4)', color: '#2d5fc4' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(45,95,196,0.25)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(45,95,196,0.12)')}>
                          View opportunity →
                        </button>
                      ) : (
                        <p className="text-xs mt-3" style={{ color: '#5b6478' }}>
                          {opp ? 'This role is now closed.' : 'This role is no longer listed.'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PlayerOpportunities({ playerId }: { playerId: string }) {
  const { openSidebar } = useSidebar()
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [activeTab, setActiveTab] = useState<'opportunities' | 'applications'>('opportunities')
  const [focusOppId, setFocusOppId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('profiles').select('id, city, location, position, secondary_position, playing_level, premium').eq('id', playerId).single()
      .then(({ data }) => setProfile(data as PlayerProfile))
  }, [playerId])

  // Jump from a "My Applications" card to the exact role in "Open Roles"
  function viewOpportunity(oppId: string) {
    setFocusOppId(oppId)
    setActiveTab('opportunities')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-0"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={openSidebar} className="flex flex-col gap-1.5" style={{ width: 20 }}>
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 14 }} />
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
          </button>
          <h1 className="text-base font-black uppercase tracking-widest"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Opportunities
          </h1>
          <div style={{ width: 20 }} />
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 pb-3">
          {([
            { key: 'opportunities', label: 'Open Roles' },
            { key: 'applications',  label: 'My Applications' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors"
              style={{
                backgroundColor: activeTab === t.key ? '#2d5fc4' : 'transparent',
                color: activeTab === t.key ? '#fff' : '#8892aa',
                border: activeTab === t.key ? 'none' : '1px solid #1e2235',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'opportunities'
        ? <OpportunitiesTab playerId={playerId} profile={profile} focusOppId={focusOppId} onFocused={() => setFocusOppId(null)} />
        : <ApplicationsTab playerId={playerId} onView={viewOpportunity} onBrowse={() => setActiveTab('opportunities')} />}
    </div>
  )
}
