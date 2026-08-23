'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { timeAgo } from '@/lib/utils'
import { useSidebar } from '@/app/dashboard/player/_components/SidebarContext'
import { MatchTypography } from '@/app/components/OpportunityBadges'
import { getStepToken } from '@/lib/stepTokens'
import { getPrimarySignal } from '@/lib/opportunitySignal'
import { toSentenceCase } from '@/lib/opportunityText'
import { LEVELS, sortLevels } from '@/lib/levels'
import { POSITIONS } from '@/lib/positions'
import ActivelyLookingModal, { type PaywallVariant } from '@/app/components/ActivelyLookingModal'
import CoachOpportunities from './CoachOpportunities'
import Icon from '@/components/ui/Icon'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import { COLORS, RADIUS_SM } from '@/components/ui/tokens'
import { Pencil, Clock, ChevronRight, ChevronDown } from 'lucide-react'
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
  onMessageChange, onApplyClick, onCancel, onConfirm, onLockedMatch, anchorId = true,
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
  // Founder-only moderation edit (see AdminEditForm above).
  isAdmin?: boolean
  onAdminSave?: (updated: Partial<Opportunity> & { id: string }) => void
}) {
  const signal = getPrimarySignal(opp)
  const title = toSentenceCase(opp.title)
  // club is already null for free players (gated server-side).
  const meta = [opp.club, opp.location].filter(Boolean).join(' · ')
  const stepToken = getStepToken(opp.level)

  // Don't repeat the position as a chip when the title already names it
  // (e.g. title "Step 6 - striker" + an "ST" chip is redundant). Folded into
  // the subtitle line rather than its own chip — the footer only carries
  // scarcity + Apply now (see MatchTypography/footer below).
  const showPos = !!opp.position && !title.toLowerCase().includes(opp.position.toLowerCase())
  const subtitle = [opp.club, opp.location, showPos ? opp.position : null].filter(Boolean).join(' · ') || 'Details to follow'

  const applyLabel = applied ? 'Applied' : 'Apply'
  const applyAria = applied
    ? `Already applied to ${title}`
    : isPremium
      ? `Apply to ${title}${meta ? ` at ${meta}` : ''}`
      : `Upgrade to Pro to apply to ${title}`

  // Show the description directly rather than hiding it behind a toggle — a
  // card with real content and a card with none shouldn't look identical.
  // Collapsed state clamps to 2 lines via CSS (line-clamp-2 below) rather than
  // a character-count slice — a real line clamp always breaks at a rendered
  // line boundary, a char slice could cut mid-word regardless of actual wrap
  // width. isLongDescription is a separate heuristic that only gates whether
  // the "See more" toggle is worth rendering at all — a description that's
  // naturally one line doesn't need an affordance to expand nothing. Real
  // overflow detection would need a ref + layout measurement, which is more
  // than this needs; ~100 chars is roughly where 2 lines fill at this card's
  // text-sm width.
  const DESCRIPTION_LINE_CLAMP_THRESHOLD = 100
  const description = opp.description || null
  const isLongDescription = !!description && description.length > DESCRIPTION_LINE_CLAMP_THRESHOLD

  const [showFullDescription, setShowFullDescription] = useState(false)
  const [editing, setEditing] = useState(false)

  return (
    <Card id={anchorId ? 'opp-' + opp.id : undefined}
      className="relative overflow-hidden h-full flex flex-col"
      style={{
        padding: 0,
        borderColor: applied ? '#2d5fc4' : undefined,
        outline: highlighted ? '2px solid #2d5fc4' : 'none',
        outlineOffset: 2,
        scrollMarginTop: 120,
      }}>
      <div style={{ padding: '13px 16px 0 16px' }} className="flex-1 flex flex-col">
        {/* Header + description grow to absorb the grid row's stretched
            height (see items-stretch on the parent grid) — so every
            collapsed card in a row lines up at the same bottom edge, with
            the Apply button anchored there, rather than a "See more" card
            visibly taller than its short-description neighbour. */}
        <div className="flex-1">
          <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
            {/* "OTHER" (off-ladder / unset level) carries no information on its
                own — the title already says what the role actually is, so the
                badge is dropped rather than showing a label that means nothing. */}
            {stepToken.step !== 0 && (
              <>
                <Badge tone="neutral">{stepToken.label}</Badge>
                <span style={{ fontSize: 11, color: COLORS.textMuted2 }}>·</span>
              </>
            )}
            <span style={{ fontSize: 11, color: COLORS.textMuted2 }}>{compactTimeAgo(opp.created_at)}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="truncate"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 500, color: COLORS.text, fontSize: 16, lineHeight: 1.2 }}>
                {title}
                {subtitle && (
                  <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 13, color: COLORS.textMuted2, marginLeft: 6 }}>
                    · {subtitle}
                  </span>
                )}
              </h3>
            </div>
            <MatchTypography matchPercent={opp.matchPercent} isPremium={isPremium} onLocked={onLockedMatch} />
          </div>

          {/* Description shows directly — no hidden-by-default toggle. Long
              descriptions clamp to a preview with "See more" so one long
              posting doesn't blow the card out relative to every short one.
              Admins get an extra "Edit" trigger for moderation. */}
          {(description || isAdmin) && !editing && (
            <div className="mt-1.5">
              {description && (
                <p className={`text-sm whitespace-pre-wrap ${!showFullDescription ? 'line-clamp-2' : ''}`} style={{ color: '#c3cbdb' }}>
                  {description}
                </p>
              )}
              {(isLongDescription || isAdmin) && (
                <div className="flex items-center gap-3 mt-1">
                  {isLongDescription && (
                    <button type="button" onClick={() => setShowFullDescription(v => !v)}
                      aria-expanded={showFullDescription}
                      className="flex items-center gap-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d8ae8] rounded"
                      style={{ color: '#4d8ae8' }}>
                      {showFullDescription ? 'See less' : 'See more'}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                        style={{ transform: showFullDescription ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true">
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                  )}
                  {isAdmin && (
                    // Admin-only moderation trigger — deliberately quieter than
                    // "See more" (a regular-user control) rather than matching
                    // its weight, so it doesn't read as a second user-facing action.
                    <button type="button" onClick={() => setEditing(true)}
                      className="flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fbbf24] rounded"
                      style={{ fontSize: 11, color: COLORS.textMuted2 }}>
                      <Icon icon={Pencil} size="xs" label={true} />
                      Edit
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {editing && (
          <AdminEditForm opp={opp}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => { onAdminSave?.(updated); setEditing(false) }} />
        )}
      </div>

      {/* Footer — scarcity signal as plain amber text (no chip background) on
          the left, Apply always right-aligned via justify-between even when
          there's no signal to show. */}
      {!isApplying && !editing && (
        <div className="flex items-center justify-between gap-2" style={{ padding: '12px 16px', borderTop: `1px solid ${COLORS.border}` }}>
          <span className="truncate" style={{ fontSize: 12, fontWeight: 600, color: COLORS.urgent }}>
            {signal?.label ?? ''}
          </span>
          <Button type="button" onClick={onApplyClick} disabled={applied}
            aria-label={applyAria} variant="primary" size="sm" className="flex-shrink-0 rounded-full">
            {applyLabel}
          </Button>
        </div>
      )}

      {isApplying && (
        <div className="space-y-2" style={{ padding: '12px 16px', borderTop: `1px solid ${COLORS.border}` }}>
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
    </Card>
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
  // Anything already shown in Best Matches is excluded from the list below —
  // the same role appearing in both sections on one screen read as a bug.
  const topMatchIds = new Set(topMatches.map(o => o.id))

  // Filter options + filtering. Club is intentionally excluded from free-player
  // search (it isn't in their payload anyway). Chronological (newest-first)
  // order is preserved — relevance ranking only surfaces in "Best matches".
  const levelOptions = sortLevels(Array.from(new Set(opportunities.map(o => o.level).filter(Boolean) as string[])))
  const positionOptions = Array.from(new Set(opportunities.map(o => o.position).filter(Boolean) as string[]))
  const q = search.trim().toLowerCase()
  const filtered = opportunities.filter(o => {
    if (topMatchIds.has(o.id)) return false
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
              <h2 className="font-bold uppercase" style={{ fontSize: 11, letterSpacing: '0.06em', color: '#8892aa' }}>
                Best matches for you
              </h2>
            </div>
            <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
              Matched to your step and position.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-stretch">
            {topMatches.map(opp => (
              <PlayerOpportunityCard key={'match-' + opp.id} {...cardProps(opp)} anchorId={false} />
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
              <span className="font-bold uppercase" style={{ fontSize: 11, letterSpacing: '0.06em', color: '#8892aa' }}>All open roles</span>
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
            className="w-full h-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#2d5fc4]"
            style={{ ...selectStyle, borderRadius: RADIUS_SM, paddingLeft: 34, paddingRight: 12 }} />
        </div>
        <div className="relative">
          <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} aria-label="Filter by level"
            className="appearance-none h-10 pl-3 text-sm outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#2d5fc4]"
            style={{ ...selectStyle, borderRadius: RADIUS_SM, paddingRight: 28 }}>
            <option value="">All levels</option>
            {levelOptions.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <Icon icon={ChevronDown} size="xs" label={true} className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ right: 10, color: '#8892aa' }} />
        </div>
        <div className="relative">
          <select value={positionFilter} onChange={e => setPositionFilter(e.target.value)} aria-label="Filter by position"
            className="appearance-none h-10 pl-3 text-sm outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#2d5fc4]"
            style={{ ...selectStyle, borderRadius: RADIUS_SM, paddingRight: 28 }}>
            <option value="">All positions</option>
            {positionOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <Icon icon={ChevronDown} size="xs" label={true} className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ right: 10, color: '#8892aa' }} />
        </div>
        <button onClick={() => setClosingSoonOnly(v => !v)} aria-pressed={closingSoonOnly}
          className="h-10 px-3.5 text-sm font-semibold transition-colors flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f59e0b]"
          style={{
            borderRadius: RADIUS_SM,
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 items-stretch">
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
        <Card className="text-center space-y-4" style={{ padding: '40px 24px' }}>
          <p className="text-sm" style={{ color: COLORS.textMuted }}>You haven&apos;t applied for any roles yet.</p>
          <Button variant="primary" size="md" onClick={onBrowse}>
            Browse Opportunities
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
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
            const title = toSentenceCase(opp?.title ?? 'Opportunity')
            const showPos = opp?.position && !title.toLowerCase().includes(opp.position.toLowerCase())
            const meta = [opp?.club, opp?.location, showPos ? opp?.position : null].filter(Boolean).join(' · ')
            const stepToken = getStepToken(opp?.level ?? null)
            return (
              <Card key={app.id} className="relative overflow-hidden h-full flex flex-col"
                style={{
                  padding: 0,
                  // Resolved applications recede. They stay readable — a player
                  // should be able to see their own history — but they stop
                  // competing with the ones still live.
                  opacity: done ? 0.72 : 1,
                }}>
                <div style={{ padding: '13px 16px 0 16px' }} className="flex-1 flex flex-col">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
                      {stepToken.step !== 0 && (
                        <>
                          <Badge tone="neutral">{stepToken.label}</Badge>
                          <span style={{ fontSize: 11, color: COLORS.textMuted2 }}>·</span>
                        </>
                      )}
                      <span style={{ fontSize: 11, color: COLORS.textMuted2 }}>Applied {timeAgo(app.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="truncate"
                          style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 500, color: COLORS.text, fontSize: 16, lineHeight: 1.2 }}>
                          {title}
                          <span style={{ fontFamily: "'Inter', sans-serif", fontWeight: 400, fontSize: 13, color: COLORS.textMuted2, marginLeft: 6 }}>
                            · {meta || 'Details to follow'}
                          </span>
                        </h3>
                      </div>
                      {/* Status tag colours follow the doctrine in
                          lib/applicationResponse.ts — grey (human decided),
                          amber (platform resolved), blue (accepted), purple
                          (shortlisted). Never restyle these independently of
                          PLAYER_APPLICATION_COPY. */}
                      <span className="flex-shrink-0 font-semibold" style={{ fontSize: 11, borderRadius: RADIUS_SM, padding: '3px 8px', color: cfg.colour, backgroundColor: cfg.bg }}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* The line that replaces the old dead-end "Pending" chip:
                        every state says what it means and what happens next. */}
                    {detail && (
                      <p className="text-xs mt-2 leading-relaxed" style={{ color: COLORS.textMuted }}>{detail}</p>
                    )}
                  </div>
                </div>

                <div style={{ padding: '12px 16px', borderTop: `1px solid ${COLORS.border}` }}>
                  {done ? (
                    // A closed application is a prompt to move, not an
                    // epitaph. Always hand them somewhere to go.
                    <Button onClick={onBrowse} variant="secondary" size="sm" className="w-full rounded-full"
                      style={{ color: '#4d8ae8', backgroundColor: 'rgba(45,95,196,0.12)', borderColor: 'rgba(45,95,196,0.4)' }}
                      trailingIcon={ChevronRight}>
                      See open roles
                    </Button>
                  ) : opp && opp.is_active ? (
                    <Button onClick={() => onView(opp.id)} variant="secondary" size="sm" className="w-full rounded-full"
                      style={{ color: '#4d8ae8', backgroundColor: 'rgba(45,95,196,0.12)', borderColor: 'rgba(45,95,196,0.4)' }}
                      trailingIcon={ChevronRight}>
                      View opportunity
                    </Button>
                  ) : (
                    <p className="text-xs text-center" style={{ color: COLORS.textMuted2 }}>
                      {opp ? 'This role is now closed.' : 'This role is no longer listed.'}
                    </p>
                  )}
                </div>
              </Card>
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
