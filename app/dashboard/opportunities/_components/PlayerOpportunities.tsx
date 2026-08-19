'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { timeAgo } from '@/lib/utils'
import { useSidebar } from '@/app/dashboard/player/_components/SidebarContext'
import { LevelBadge, StepBadge, MatchChip, SignalChip } from '@/app/components/OpportunityBadges'
import { getLevelConfig } from '@/lib/opportunityLevel'
import { getPrimarySignal } from '@/lib/opportunitySignal'
import { LEVELS, sortLevels } from '@/lib/levels'
import { POSITIONS } from '@/lib/positions'
import ActivelyLookingModal, { type PaywallVariant } from '@/app/components/ActivelyLookingModal'
import CoachOpportunities from './CoachOpportunities'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import { Pencil, Clock, ChevronRight } from 'lucide-react'
import {
  getPlayerApplicationState,
  PLAYER_APPLICATION_COPY,
  getRoleClosedDetail,
  isDeadEnd,
} from '@/lib/applicationResponse'

// ─── Types ────────────────────────────────────────────────────────────────────

// Shape returned by /api/opportunities/feed. `club` is null for free players,
// `matchPercent` is null unless the viewer is premium — both gated server-side.
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
  inRange: boolean
  isCloseMatch: boolean
  matchPercent: number | null
}

type Application = {
  id: string
  status: string
  created_at: string
  closed_at: string | null
  close_reason: string | null
  opportunity: {
    id: string
    title: string
    club: string | null
    location: string | null
    position: string | null
    level: string | null
    is_active: boolean
    auto_close_reason: string | null
  } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Generic pill used for the position tag on a card. Status signals use the
// shared SignalChip; the match score uses the shared MatchChip.
function Chip({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0"
      style={{ color, backgroundColor: bg }}>
      {children}
    </span>
  )
}

// Status copy now lives in lib/applicationResponse.ts (PLAYER_APPLICATION_COPY)
// so the cron that closes applications and the UI that renders them can never
// disagree about what a player is being told.

function SkeletonRow() {
  return (
    <div className="rounded-2xl p-4 space-y-3 animate-pulse motion-reduce:animate-none" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
      <div className="h-4 rounded w-48" style={{ backgroundColor: '#1e2235' }} />
      <div className="h-3 rounded w-64" style={{ backgroundColor: '#1e2235' }} />
      <div className="flex gap-2">
        <div className="h-5 w-16 rounded-full" style={{ backgroundColor: '#1e2235' }} />
        <div className="h-5 w-20 rounded-full" style={{ backgroundColor: '#1e2235' }} />
      </div>
    </div>
  )
}

// Pin glyph for the location line.
function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}

// ─── Admin moderation edit ────────────────────────────────────────────────────
// Founder-only. Lets an amber-flagged coach post be corrected in place — e.g.
// rewriting "apply via email/DM" instructions to point back to NEXT11VEN, or
// scrubbing a third-party promo mention — without waiting on the coach.
const adminFieldStyle = { backgroundColor: '#0a0a0a', border: '1px solid #1e2235', color: '#e8dece' }

function AdminEditForm({ opp, onCancel, onSaved }: {
  opp: Opportunity
  onCancel: () => void
  onSaved: (updated: Partial<Opportunity> & { id: string }) => void
}) {
  const [title, setTitle] = useState(opp.title)
  const [club, setClub] = useState(opp.club ?? '')
  const [location, setLocation] = useState(opp.location ?? '')
  const [position, setPosition] = useState(opp.position ?? '')
  const [level, setLevel] = useState(opp.level ?? '')
  const [description, setDescription] = useState(opp.description ?? '')
  const [deadline, setDeadline] = useState(opp.deadline ?? '')
  const [urgent, setUrgent] = useState(opp.urgent)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/admin/opportunities/${opp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        club: club.trim() || null,
        location: location.trim() || null,
        position: position || null,
        level: level || null,
        description: description.trim() || null,
        deadline: deadline || null,
        urgent,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to save changes'); setSaving(false); return }
    onSaved(data.opportunity)
  }

  return (
    <div className="mt-3 space-y-2.5 rounded-xl p-3" style={{ border: '1px solid rgba(245,158,11,0.4)', backgroundColor: 'rgba(245,158,11,0.05)' }}>
      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: '#fbbf24' }}>Admin edit</p>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title"
        className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={adminFieldStyle} />
      <div className="grid grid-cols-2 gap-2">
        <input value={club} onChange={e => setClub(e.target.value)} placeholder="Club"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={adminFieldStyle} />
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Area"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={adminFieldStyle} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select value={position} onChange={e => setPosition(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={adminFieldStyle}>
          <option value="">Any position</option>
          {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={level} onChange={e => setLevel(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={adminFieldStyle}>
          <option value="">No level</option>
          {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={adminFieldStyle}
        placeholder="Description" />
      <div className="flex items-center gap-3">
        <input type="date" value={deadline ?? ''} onChange={e => setDeadline(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm outline-none" style={adminFieldStyle} />
        <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: urgent ? '#f59e0b' : '#8892aa' }}>
          <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="accent-amber-500" />
          Urgent
        </label>
      </div>
      {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} disabled={saving}
          className="flex-1 rounded-full py-2 text-xs font-semibold uppercase tracking-wider disabled:opacity-50"
          style={{ border: '1px solid #1e2235', color: '#8892aa' }}>
          Cancel
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex-1 rounded-full py-2 text-xs font-semibold uppercase tracking-wider disabled:opacity-50"
          style={{ backgroundColor: '#f59e0b', color: '#0a0a0a' }}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ─── Opportunity card ─────────────────────────────────────────────────────────
// Two paths only: apply now, or go Premium then apply. The filled blue Apply
// button is the single strongest element; the match chip is the premium hook.
function PlayerOpportunityCard({
  opp, isPremium, applied, isApplying, highlighted, message,
  onMessageChange, onApplyClick, onCancel, onConfirm, onLockedMatch, anchorId = true, hero = false,
  isAdmin = false, onAdminSave,
}: {
  opp: Opportunity
  isPremium: boolean
  applied: boolean
  isApplying: boolean
  highlighted: boolean
  message: string
  onMessageChange: (v: string) => void
  onApplyClick: () => void
  onCancel: () => void
  onConfirm: () => void
  onLockedMatch: () => void
  // Set false for a duplicate render of the same opportunity (e.g. the "Best
  // matches" preview) so it doesn't collide with the main list's anchor id.
  anchorId?: boolean
  // Best-matches treatment: a subtle amber ring + glow on the card itself (no
  // wrapper box, so an odd match count never leaves a dead glowing cell).
  hero?: boolean
  // Founder-only moderation edit (see AdminEditForm above).
  isAdmin?: boolean
  onAdminSave?: (updated: Partial<Opportunity> & { id: string }) => void
}) {
  const signal = getPrimarySignal(opp)
  const title = toSentenceCase(opp.title)
  // club is already null for free players (gated server-side).
  const meta = [opp.club, opp.location].filter(Boolean).join(' · ')
  // Left accent rail in the step colour; desaturated when the role is outside
  // the player's ±1 step range (see StepBadge).
  const railToken = getLevelConfig(opp.level)
  const railColor = opp.inRange ? railToken.color : '#64748b'

  // Don't repeat the position as a chip when the title already names it
  // (e.g. title "Step 6 - striker" + an "ST" chip is redundant).
  const showPos = !!opp.position && !title.toLowerCase().includes(opp.position.toLowerCase())

  const applyLabel = applied ? 'Applied' : 'Apply'
  const applyAria = applied
    ? `Already applied to ${title}`
    : isPremium
      ? `Apply to ${title}${meta ? ` at ${meta}` : ''}`
      : `Upgrade to Pro to apply to ${title}`

  const [detailsOpen, setDetailsOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <article id={anchorId ? 'opp-' + opp.id : undefined}
      className="relative rounded-2xl overflow-hidden transition-colors"
      style={{
        backgroundColor: '#13172a',
        border: `1px solid ${hero ? 'rgba(251,191,36,0.35)' : applied ? '#2d5fc4' : '#1e2235'}`,
        outline: highlighted ? '2px solid #2d5fc4' : 'none',
        outlineOffset: 2,
        boxShadow: hero ? '0 0 20px rgba(251,191,36,0.06)' : undefined,
        scrollMarginTop: 120,
      }}>
      {/* Step-colour accent rail */}
      <span aria-hidden="true" className="absolute left-0 top-0 bottom-0" style={{ width: 3, backgroundColor: railColor, opacity: opp.inRange ? 1 : 0.5 }} />

      <div style={{ padding: '13px 14px 13px 16px' }}>
        <div className="flex gap-2.5">
          <StepBadge level={opp.level} inRange={opp.inRange} size={44} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold truncate"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', fontSize: 16, lineHeight: 1.2 }}>
                {title}
              </h3>
              {/* Top-right cluster — match % (the premium hook) sits up on the
                  title line, with the timestamp beside it. */}
              <div className="flex items-center gap-2 flex-shrink-0" style={{ paddingTop: 1 }}>
                <MatchChip matchPercent={opp.matchPercent} isPremium={isPremium} onLocked={onLockedMatch} />
                <span style={{ fontSize: 11, color: '#5b6478' }}>{compactTimeAgo(opp.created_at)}</span>
              </div>
            </div>
            <p className="truncate mt-1 flex items-center gap-1" style={{ fontSize: 12, color: '#8892aa' }}>
              <PinIcon />
              <span className="truncate">{meta || 'Details to follow'}</span>
            </p>
          </div>
        </div>

        {/* View details — collapsed by default, reveals the coach's full
            description when the card only shows the bare essentials. Admins
            get an extra "Edit" trigger alongside it for moderation. */}
        {(opp.description || isAdmin) && !editing && (
          <div className="mt-1.5">
            <div className="flex items-center gap-3">
              {opp.description && (
                <button type="button" onClick={() => setDetailsOpen(v => !v)}
                  aria-expanded={detailsOpen}
                  className="flex items-center gap-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d8ae8] rounded"
                  style={{ color: '#6ea0f0' }}>
                  {detailsOpen ? 'Hide details' : 'View details'}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: detailsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              )}
              {isAdmin && (
                <button type="button" onClick={() => setEditing(true)}
                  className="flex items-center gap-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fbbf24] rounded"
                  style={{ color: '#fbbf24' }}>
                  <Icon icon={Pencil} size="sm" label={true} />
                  Edit
                </button>
              )}
            </div>
            {detailsOpen && opp.description && (
              <p className="mt-1.5 text-sm whitespace-pre-wrap" style={{ color: '#c3cbdb' }}>
                {opp.description}
              </p>
            )}
          </div>
        )}

        {editing && (
          <AdminEditForm opp={opp}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => { onAdminSave?.(updated); setEditing(false) }} />
        )}

        {/* Action row — supporting chips (position / applicant / deadline signal)
            fill the space to the LEFT of the Apply button rather than taking
            their own row, so the card stays compact. Apply is a soft, compact,
            right-aligned pill. */}
        {!isApplying && !editing && (
          <div className="mt-2.5 flex items-center gap-2">
            {(showPos || signal) && (
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                {showPos && <Chip color="#60a5fa" bg="rgba(96,165,250,0.12)">{opp.position!.toUpperCase()}</Chip>}
                {signal && <SignalChip signal={signal} />}
              </div>
            )}
            <Button type="button" onClick={onApplyClick} disabled={applied}
              aria-label={applyAria} variant="primary" size="sm" className="ml-auto rounded-full">
              {applyLabel}
            </Button>
          </div>
        )}

        {isApplying && (
          <div className="space-y-2 mt-3">
            <textarea value={message} onChange={e => onMessageChange(e.target.value)} rows={3}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none focus-visible:ring-2 focus-visible:ring-[#2d5fc4]"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2d5fc4', color: '#e8dece' }}
              placeholder="Tell the coach about yourself (optional)…" />
            <div className="flex gap-2">
              <Button onClick={onCancel} variant="secondary" size="md" className="flex-1 rounded-full">
                Cancel
              </Button>
              <Button onClick={onConfirm} variant="primary" size="md" className="flex-1 rounded-full">
                Confirm Apply
              </Button>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

// ─── Opportunities Tab ────────────────────────────────────────────────────────

function OpportunitiesTab({ playerId, focusOppId, onFocused, isAdmin = false }: {
  playerId: string
  focusOppId: string | null
  onFocused: () => void
  isAdmin?: boolean
}) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set())
  const [isPremium, setIsPremium] = useState(false)
  const [matchedCount, setMatchedCount] = useState(0)
  const [applying, setApplying] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [closingSoonOnly, setClosingSoonOnly] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  // Premium paywall — shared modal, copy varies by the action that triggered it.
  const [paywall, setPaywall] = useState<PaywallVariant | null>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/opportunities/feed')
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setOpportunities((data.opportunities ?? []) as Opportunity[])
      setAppliedIds(new Set<string>(data.appliedIds ?? []))
      setIsPremium(data.premium === true)
      setMatchedCount(data.matchedCount ?? 0)
      setLoading(false)
    }
    load()
  }, [playerId])

  // Free players can't apply (API returns 403) — reaching for Apply opens the
  // paywall instead. Premium players expand the inline apply form.
  function handleApplyClick(opp: Opportunity) {
    if (!isPremium) { setPaywall('apply'); return }
    setApplying(opp.id)
  }

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

  // Admin moderation save — merge the patched fields into local state so the
  // card reflects the edit immediately without a full refetch.
  function handleAdminSave(updated: Partial<Opportunity> & { id: string }) {
    setOpportunities(prev => prev.map(o => o.id === updated.id ? { ...o, ...updated } : o))
  }

  // "Best matches for you" — the server-flagged close matches (position fit +
  // within one step). Capped at 3 so it reads as earned, not padded. Premium
  // orders by the real match %, free keeps the server's newest-first order.
  const closeMatches = opportunities.filter(o => o.isCloseMatch)
  const topMatches = (isPremium
    ? [...closeMatches].sort((a, b) => (b.matchPercent ?? 0) - (a.matchPercent ?? 0))
    : closeMatches
  ).slice(0, 3)

  // Filter options + filtering. Club is intentionally excluded from free-player
  // search (it isn't in their payload anyway). Chronological (newest-first)
  // order is preserved — relevance ranking only surfaces in "Best matches".
  const levelOptions = sortLevels(Array.from(new Set(opportunities.map(o => o.level).filter(Boolean) as string[])))
  const positionOptions = Array.from(new Set(opportunities.map(o => o.position).filter(Boolean) as string[]))
  const q = search.trim().toLowerCase()
  const filtered = opportunities.filter(o => {
    if (levelFilter && o.level !== levelFilter) return false
    if (positionFilter && o.position !== positionFilter) return false
    if (closingSoonOnly && getPrimarySignal(o)?.key !== 'urgent') return false
    if (q) {
      const hay = [o.title, o.location, o.position, o.level, o.description, o.club].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const hasActiveFilters = !!(q || levelFilter || positionFilter || closingSoonOnly)
  const selectStyle = { backgroundColor: '#0d1020', border: '1px solid #1e2235', color: '#e8dece' }

  function clearFilters() { setSearch(''); setLevelFilter(''); setPositionFilter(''); setClosingSoonOnly(false) }

  // Deep-link from "My Applications": clear filters so the target isn't hidden,
  // then scroll to and briefly highlight the role they applied to.
  useEffect(() => {
    if (!focusOppId || loading) return
    const id = focusOppId
    setSearch(''); setLevelFilter(''); setPositionFilter(''); setClosingSoonOnly(false)
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

  const cardProps = (opp: Opportunity) => ({
    opp,
    isPremium,
    applied: appliedIds.has(opp.id),
    isApplying: applying === opp.id,
    highlighted: highlightId === opp.id,
    message,
    onMessageChange: setMessage,
    onApplyClick: () => handleApplyClick(opp),
    onCancel: () => { setApplying(null); setMessage('') },
    onConfirm: () => handleApply(opp),
    onLockedMatch: () => setPaywall('match'),
    isAdmin,
    onAdminSave: handleAdminSave,
  })

  if (loading) return (
    <div className="space-y-4 px-4 py-4">
      {[0,1,2].map(i => <SkeletonRow key={i} />)}
    </div>
  )

  if (opportunities.length === 0) return (
    <div className="px-4 py-4">
      <div className="rounded-2xl p-10 text-center space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
        <p className="text-sm" style={{ color: '#8892aa' }}>No opportunities posted yet. Check back soon — coaches post new roles regularly.</p>
        <Button variant="primary" size="md" href="/dashboard/player/profile">
          Update My Profile
        </Button>
      </div>
    </div>
  )

  return (
    <div className="px-4 py-4 space-y-4 max-w-5xl mx-auto">
      <ActivelyLookingModal open={paywall !== null} onClose={() => setPaywall(null)} variant={paywall ?? 'apply'} />

      {/* Best matches for you — capped at 3, richer treatment (star eyebrow +
          subtle glow), then a clean divider into the full list. */}
      {topMatches.length >= 1 && (
        <div className="space-y-2">
          <div>
            <div className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#e8dece' }}>
                Best matches for you
              </h2>
            </div>
            <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
              Matched to your step and position.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-start">
            {topMatches.map(opp => (
              <PlayerOpportunityCard key={'match-' + opp.id} {...cardProps(opp)} anchorId={false} hero />
            ))}
          </div>

          {/* Inline premium upsell — free players only, honest benefits. */}
          {!isPremium && matchedCount > 0 && (
            <Link href="/dashboard/player/premium"
              className="block rounded-2xl p-4 mt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
              style={{
                border: '1px solid rgba(245,158,11,0.4)',
                background: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(19,23,42,0.6) 60%)',
              }}>
              <p className="font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#fbbf24', fontSize: 17, letterSpacing: '0.02em' }}>
                You match {matchedCount} open {matchedCount === 1 ? 'role' : 'roles'} right now
              </p>
              <p className="text-sm mt-1" style={{ color: '#e8dece' }}>
                Go Pro to apply to them, unlock your match score on every role, and rank above free players when coaches browse.
              </p>
              <span className="inline-flex items-center gap-2 mt-3 rounded-full px-5 py-2 text-sm font-bold"
                style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                Go Pro · £6.99/mo
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          )}

          <div className="pt-2">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1" style={{ backgroundColor: '#1e2235' }} />
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#5b6478' }}>All open roles</span>
              <span className="h-px flex-1" style={{ backgroundColor: '#1e2235' }} />
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1" style={{ minWidth: 180 }}>
          <svg className="absolute top-1/2 -translate-y-1/2" style={{ left: 12 }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)}
            aria-label="Search roles and areas"
            placeholder="Search roles, areas…"
            className="w-full rounded-full py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2d5fc4]"
            style={{ ...selectStyle, paddingLeft: 34, paddingRight: 12 }} />
        </div>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} aria-label="Filter by level"
          className="rounded-full px-3 py-2 text-sm outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#2d5fc4]" style={selectStyle}>
          <option value="">All levels</option>
          {levelOptions.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)} aria-label="Filter by position"
          className="rounded-full px-3 py-2 text-sm outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#2d5fc4]" style={selectStyle}>
          <option value="">All positions</option>
          {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={() => setClosingSoonOnly(v => !v)} aria-pressed={closingSoonOnly}
          className="rounded-full px-3.5 py-2 text-sm font-semibold transition-colors flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
          style={{
            backgroundColor: closingSoonOnly ? 'rgba(244,63,94,0.15)' : '#0d1020',
            border: `1px solid ${closingSoonOnly ? '#fb7185' : '#1e2235'}`,
            color: closingSoonOnly ? '#fb7185' : '#8892aa',
          }}>
          <Icon icon={Clock} size="sm" label={true} />
          Closing soon
        </button>
        {hasActiveFilters && (
          <button onClick={clearFilters}
            className="text-xs uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8892aa] rounded px-1" style={{ color: '#8892aa' }}>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-start">
          {filtered.map(opp => (
            <PlayerOpportunityCard key={opp.id} {...cardProps(opp)} />
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
      .select('id, status, created_at, closed_at, close_reason, opportunity:opportunity_id(id, title, club, location, position, level, is_active, auto_close_reason)')
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

  // Live applications first, resolved ones beneath, each newest-first. The
  // query already sorts by date; this is a stable partition on top of it, so a
  // player opening the tab sees what's still in play before their history.
  const ordered = [
    ...applications.filter(a => !isDeadEnd(getPlayerApplicationState(a.status, a.closed_at, a.close_reason))),
    ...applications.filter(a => isDeadEnd(getPlayerApplicationState(a.status, a.closed_at, a.close_reason))),
  ]

  return (
    <div className="px-4 py-4 max-w-5xl mx-auto">
      {applications.length === 0 ? (
        <div className="rounded-2xl p-10 text-center space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>You haven&apos;t applied for any roles yet.</p>
          <Button variant="primary" size="md" onClick={onBrowse}>
            Browse Opportunities
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {ordered.map(app => {
            const state = getPlayerApplicationState(app.status, app.closed_at, app.close_reason)
            const cfg = PLAYER_APPLICATION_COPY[state]
            const done = isDeadEnd(state)
            const opp = app.opportunity
            // closed_role_gone's detail varies by WHY the role closed — a
            // stale/neglected auto-close must never read as if the coach acted.
            const detail = state === 'closed_role_gone'
              ? getRoleClosedDetail(opp?.auto_close_reason as 'stale' | 'neglected' | null)
              : cfg.detail
            const showPos = opp?.position && !opp.title?.toLowerCase().includes(opp.position.toLowerCase())
            const meta = [opp?.club, opp?.location, showPos ? opp?.position : null].filter(Boolean).join(' · ')
            return (
              <div key={app.id} className="rounded-2xl overflow-hidden"
                style={{
                  backgroundColor: '#13172a',
                  border: '1px solid #1e2235',
                  // Resolved applications recede. They stay readable — a player
                  // should be able to see their own history — but they stop
                  // competing with the ones still live.
                  opacity: done ? 0.72 : 1,
                }}>
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
                          style={{ color: cfg.colour, backgroundColor: cfg.bg }}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs mt-1 truncate" style={{ color: '#8892aa' }}>{meta || '—'}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#5b6478' }}>Applied {timeAgo(app.created_at)}</p>

                      {/* The line that replaces the old dead-end "Pending" chip:
                          every state says what it means and what happens next. */}
                      {detail && (
                        <p className="text-xs mt-2 leading-relaxed" style={{ color: '#8892aa' }}>{detail}</p>
                      )}

                      {done ? (
                        // A closed application is a prompt to move, not an
                        // epitaph. Always hand them somewhere to go.
                        <Button onClick={onBrowse} variant="secondary" size="sm" className="mt-3 rounded-full"
                          style={{ color: '#4d8ae8', backgroundColor: 'rgba(45,95,196,0.12)', borderColor: 'rgba(45,95,196,0.4)' }}
                          trailingIcon={ChevronRight}>
                          See open roles
                        </Button>
                      ) : opp && opp.is_active ? (
                        <Button onClick={() => onView(opp.id)} variant="secondary" size="sm" className="mt-3 rounded-full"
                          style={{ color: '#4d8ae8', backgroundColor: 'rgba(45,95,196,0.12)', borderColor: 'rgba(45,95,196,0.4)' }}
                          trailingIcon={ChevronRight}>
                          View opportunity
                        </Button>
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

export default function PlayerOpportunities({ playerId, isAdmin = false }: { playerId: string; isAdmin?: boolean }) {
  const { openSidebar } = useSidebar()
  // ?tab=applications lets the application-decision notification land on the
  // card that carries the answer instead of the generic Open Roles list.
  // ?tab=manage does the same for the founder-only "My Postings" tab.
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'opportunities' | 'applications' | 'manage'>(
    searchParams.get('tab') === 'applications' ? 'applications'
      : searchParams.get('tab') === 'manage' && isAdmin ? 'manage'
      : 'opportunities'
  )
  const [focusOppId, setFocusOppId] = useState<string | null>(null)

  // Jump from a "My Applications" card to the exact role in "Open Roles"
  function viewOpportunity(oppId: string) {
    setFocusOppId(oppId)
    setActiveTab('opportunities')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header — bar spans full width, inner content shares the same
          max-w-5xl column as the body so they align on desktop. */}
      <div className="sticky top-0 z-10 pt-4 pb-0"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={openSidebar} aria-label="Open menu" className="flex flex-col gap-1.5" style={{ width: 20 }}>
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

          {/* Sub-tabs — "My Postings" is founder-only: lets the admin post
              opportunities and manage applicants like a coach would, without
              turning their account into a coach anywhere else in the app. */}
          <div className="flex gap-1 pb-3 overflow-x-auto">
            {([
              { key: 'opportunities', label: 'Open Roles' },
              { key: 'applications',  label: 'My Applications' },
              { key: 'manage',        label: 'My Postings' },
            ] as const).filter(t => t.key !== 'manage' || isAdmin).map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d8ae8]"
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
      </div>

      {activeTab === 'opportunities'
        ? <OpportunitiesTab playerId={playerId} focusOppId={focusOppId} onFocused={() => setFocusOppId(null)} isAdmin={isAdmin} />
        : activeTab === 'applications'
          ? <ApplicationsTab playerId={playerId} onView={viewOpportunity} onBrowse={() => setActiveTab('opportunities')} />
          : <CoachOpportunities coachId={playerId} embedded />}
    </div>
  )
}
