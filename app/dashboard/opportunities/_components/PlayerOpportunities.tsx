'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { timeAgo } from '@/lib/utils'
import { useSidebar } from '@/app/dashboard/player/_components/SidebarContext'
import { LevelBadge, StepBadge } from '@/app/components/OpportunityBadges'
import { getLevelConfig } from '@/lib/opportunityLevel'
import { sortLevels } from '@/lib/levels'
import ActivelyLookingModal, { type PaywallVariant } from '@/app/components/ActivelyLookingModal'

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

type PrimarySignal = { key: 'urgent' | 'first' | 'few'; label: string; color: string; bg: string; pulse?: boolean }

// Single highest-priority status signal for the card. Three tiers only — the
// blanket red "Urgent" is retired:
//   urgent (red)   — GENUINE deadline pressure. Driven by deadline proximity,
//                    NOT the manual boolean. The boolean can only widen the
//                    window (7d vs 4d) — with no deadline it never fires red,
//                    so we don't recreate the red-spam problem.
//   first  (blue)  — zero applications yet ("Be first to apply").
//   few    (violet)— low application count ("Only N applied").
function getPrimarySignal(opp: { urgent: boolean; deadline: string | null; application_count: number }): PrimarySignal | null {
  const dl = opp.deadline ? daysLeft(opp.deadline) : null
  const urgentWindow = opp.urgent ? 7 : 4
  if (dl !== null && dl >= 0 && dl <= urgentWindow) {
    return { key: 'urgent', label: dl === 0 ? '⏳ Closes today' : `⏳ ${dl}d left`, color: '#fb7185', bg: 'rgba(244,63,94,0.12)', pulse: true }
  }
  if (opp.application_count === 0) return { key: 'first', label: '🚀 Be first to apply', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' }
  if (opp.application_count < 5) return { key: 'few', label: `👥 Only ${opp.application_count} applied`, color: '#c084fc', bg: 'rgba(168,85,247,0.12)' }
  return null
}

function Chip({ children, color, bg, pulse }: { children: React.ReactNode; color: string; bg: string; pulse?: boolean }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${pulse ? 'animate-pulse motion-reduce:animate-none' : ''}`}
      style={{ color, backgroundColor: bg }}>
      {children}
    </span>
  )
}

// Match-score chip — the primary premium hook. Premium: the real NN% (green when
// strong, blue otherwise). Free: a locked chip that triggers the match paywall.
function MatchChip({ opp, isPremium, onLocked }: { opp: Opportunity; isPremium: boolean; onLocked: () => void }) {
  if (isPremium && opp.matchPercent !== null) {
    const strong = opp.matchPercent >= 85
    const color = strong ? '#22c55e' : '#4d8ae8'
    return (
      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold flex-shrink-0"
        style={{ color, backgroundColor: `${color}1f` }}>
        {opp.matchPercent}% match
      </span>
    )
  }
  if (isPremium) return null // premium but no signal to score against
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onLocked() }}
      aria-label="Match score locked — upgrade to Premium to see how well this role fits you"
      className="text-xs px-2.5 py-0.5 rounded-full font-bold flex-shrink-0 inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d8ae8]"
      style={{ color: '#8892aa', backgroundColor: 'rgba(136,146,170,0.12)' }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Match
    </button>
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

// ─── Opportunity card ─────────────────────────────────────────────────────────
// Two paths only: apply now, or go Premium then apply. The filled blue Apply
// button is the single strongest element; the match chip is the premium hook.
function PlayerOpportunityCard({
  opp, isPremium, applied, isApplying, highlighted, message,
  onMessageChange, onApplyClick, onCancel, onConfirm, onLockedMatch, anchorId = true, hero = false,
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

  const applyLabel = applied ? '✓ Applied' : 'Apply'
  const applyAria = applied
    ? `Already applied to ${title}`
    : isPremium
      ? `Apply to ${title}${meta ? ` at ${meta}` : ''}`
      : `Upgrade to Premium to apply to ${title}`

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
                <MatchChip opp={opp} isPremium={isPremium} onLocked={onLockedMatch} />
                <span style={{ fontSize: 11, color: '#5b6478' }}>{compactTimeAgo(opp.created_at)}</span>
              </div>
            </div>
            <p className="truncate mt-1 flex items-center gap-1" style={{ fontSize: 12, color: '#8892aa' }}>
              <PinIcon />
              <span className="truncate">{meta || 'Details to follow'}</span>
            </p>
          </div>
        </div>

        {/* Action row — supporting chips (position / applicant / deadline signal)
            fill the space to the LEFT of the Apply button rather than taking
            their own row, so the card stays compact. Apply is a soft, compact,
            right-aligned pill. */}
        {!isApplying && (
          <div className="mt-2.5 flex items-center gap-2">
            {(showPos || signal) && (
              <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
                {showPos && <Chip color="#60a5fa" bg="rgba(96,165,250,0.12)">{opp.position!.toUpperCase()}</Chip>}
                {signal && <Chip color={signal.color} bg={signal.bg} pulse={signal.pulse}>{signal.label}</Chip>}
              </div>
            )}
            <button type="button" onClick={onApplyClick} disabled={applied}
              aria-label={applyAria}
              className="ml-auto flex-shrink-0 rounded-full px-6 py-2 text-sm font-bold uppercase tracking-wider transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#13172a] focus-visible:ring-[#4d8ae8] disabled:cursor-default"
              style={applied
                ? { backgroundColor: 'rgba(45,95,196,0.12)', color: '#6ea0f0', border: '1px solid rgba(45,95,196,0.35)' }
                : { backgroundColor: 'rgba(45,95,196,0.22)', color: '#8fb4f5', border: '1px solid rgba(45,95,196,0.6)' }}>
              {applyLabel}
            </button>
          </div>
        )}

        {isApplying && (
          <div className="space-y-2 mt-3">
            <textarea value={message} onChange={e => onMessageChange(e.target.value)} rows={3}
              className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none focus-visible:ring-2 focus-visible:ring-[#2d5fc4]"
              style={{ backgroundColor: '#0a0a0a', border: '1px solid #2d5fc4', color: '#e8dece' }}
              placeholder="Tell the coach about yourself (optional)…" />
            <div className="flex gap-2">
              <button onClick={onCancel}
                className="flex-1 rounded-full py-2.5 text-sm font-semibold uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8892aa]"
                style={{ border: '1px solid #1e2235', color: '#8892aa' }}>
                Cancel
              </button>
              <button onClick={onConfirm}
                className="flex-1 rounded-full py-2.5 text-sm font-semibold uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d8ae8]"
                style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                Confirm Apply
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

// ─── Opportunities Tab ────────────────────────────────────────────────────────

function OpportunitiesTab({ playerId, focusOppId, onFocused }: {
  playerId: string
  focusOppId: string | null
  onFocused: () => void
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
        <Link href="/dashboard/player/profile"
          className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold"
          style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
          Update My Profile
        </Link>
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
                Go Premium to apply to them, unlock your match score on every role, and rank above free players when coaches browse.
              </p>
              <span className="inline-flex items-center gap-2 mt-3 rounded-full px-5 py-2 text-sm font-bold"
                style={{ backgroundColor: '#2d5fc4', color: '#fff' }}>
                Go Premium · £6.99/mo
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
          ⏳ Closing soon
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
    <div className="px-4 py-4 max-w-5xl mx-auto">
      {applications.length === 0 ? (
        <div className="rounded-2xl p-10 text-center space-y-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-sm" style={{ color: '#8892aa' }}>You haven&apos;t applied for any roles yet.</p>
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
                          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d8ae8]"
                          style={{ backgroundColor: 'rgba(45,95,196,0.12)', border: '1px solid rgba(45,95,196,0.4)', color: '#2d5fc4' }}>
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
  const [activeTab, setActiveTab] = useState<'opportunities' | 'applications'>('opportunities')
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

          {/* Sub-tabs */}
          <div className="flex gap-1 pb-3">
            {([
              { key: 'opportunities', label: 'Open Roles' },
              { key: 'applications',  label: 'My Applications' },
            ] as const).map(t => (
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
        ? <OpportunitiesTab playerId={playerId} focusOppId={focusOppId} onFocused={() => setFocusOppId(null)} />
        : <ApplicationsTab playerId={playerId} onView={viewOpportunity} onBrowse={() => setActiveTab('opportunities')} />}
    </div>
  )
}
