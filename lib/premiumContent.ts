// ─── Player Premium — single source of truth for copy, stats & feature order ───
//
// Every premium surface (Actively Looking modal, locked-message trigger, Player
// Premium page, Free vs Premium comparison) pulls from this file so language and
// ordering can never drift. See the Premium Conversion Redesign spec.
//
// RULE: every surface sells "pay to be found" in the canonical order below, using
// the EXACT figures here. Do not invent numbers. Do not reorder per-surface.

import { positionCategory } from '@/lib/positions'

export const PREMIUM_PRICE = '£6.99'
export const PREMIUM_PRICE_PER_MONTH = '£6.99/mo'
// £6.99 / 4.33 weeks ≈ £1.61 — anchored as "about £1.60 a week" per spec.
export const PREMIUM_PRICE_WEEKLY = 'About £1.60 a week'
export const PREMIUM_PRICE_WEEKLY_LOWER = 'about £1.60 a week'

// Real platform figures — do NOT use the inflated 7× anywhere. Lead with 3×.
export const PREMIUM_STATS = {
  discoveryMultiplier: '3×',
  foundPremiumPct: '76%',
  foundFreePct: '25%',
  avgViewsPremium: '2.6',
  avgViewsFree: '0.4',
} as const

// The single proof line — used as fallback whenever the live count is too thin.
export const PROOF_LINE = 'Premium players are 3× more likely to be found by a coach.'

// Brand-voice line under the Get Discovered hero card — emotional, not functional.
// Ties straight to Actively Looking: opting in = putting your hand up.
export const DISCOVER_EMOTIONAL_LINE = 'Stop waiting to be found. Put your hand up.'

// Outcome line — Avro FC showcase, 31 May 2026.
export const SHOWCASE_LINE = '6 players were in club talks within 24 hours of our last Showcase.'

// ─── Canonical feature order (§0) — used on the Premium page ──────────────────
// `hero`     → flagship card (Get discovered)
// `footnote` → demoted, small-weight row (Premium badge)
export type PremiumFeature = {
  id: string
  title: string
  copy: string
  hero?: boolean
  footnote?: boolean
}

export const PREMIUM_FEATURES: PremiumFeature[] = [
  {
    id: 'discovered',
    title: 'Get discovered',
    copy: 'Switch on Actively Looking and appear in the carousel and free-agent searches coaches see first.',
    hero: true,
  },
  {
    id: 'shortlist',
    title: 'See who viewed and shortlisted you',
    copy: 'Know which coaches viewed you — and which saved you to a shortlist, the strongest buying signal on the platform.',
  },
  {
    id: 'messages',
    // Resolves the read-vs-initiate contradiction (§7): the true dual model.
    title: 'Read & reply to coach messages',
    copy: 'Read & reply to coach messages, plus 3 direct intros to coaches a month — and because intros are limited, coaches actually read them.',
  },
  {
    id: 'trials',
    title: 'Apply to trials & showcases instantly',
    copy: 'First access to trials and showcase events.',
  },
  {
    id: 'ranking',
    title: 'Appear higher in coach search',
    copy: 'Rank above free players when coaches browse.',
  },
  {
    id: 'badge',
    title: 'Premium badge',
    copy: 'A Premium badge on your profile.',
    footnote: true,
  },
]

// ─── Modal bullets (§2) — reframed around the toggle moment, 3 only ───────────
export const MODAL_BULLETS = [
  'Appear in the Actively Looking carousel & searches',
  "See who's viewed and shortlisted you",
  'Read messages coaches send you',
] as const

// ─── Free vs Premium comparison rows (§5) ─────────────────────────────────────
// Free cells describe what coaches CAN'T do — loss aversion does the work.
// Max 6 rows, canonical order.
export type ComparisonRow = {
  label: string
  free: string
  premium: string
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  { label: 'Appear in searches coaches see first', free: "Coaches can't find you in search", premium: 'In the Actively Looking carousel + free-agent searches' },
  { label: 'Messages from coaches', free: "Locked — you can't read them", premium: 'Read & reply to every coach message instantly' },
  { label: 'See who viewed & shortlisted you', free: 'Hidden', premium: 'Full list of who viewed and saved you' },
  { label: 'Message coaches directly', free: '—', premium: '3 direct intros a month coaches actually read' },
  { label: 'Trials & showcases', free: 'Wait for general release', premium: 'First access before general release' },
  { label: 'Search ranking', free: 'Bottom of the pile', premium: 'Rank above free players when coaches browse' },
]

// ─── Live coach count copy (§6) ───────────────────────────────────────────────
// The API returns a count + scope; this builds the suffix that follows the
// animated number. Floor logic (never 0 / never a bare deflating 1) lives in the
// API — by the time copy is built, n is always >= 3 or the caller shows PROOF_LINE.
export type LiveCountScope = 'local' | 'position'

export function liveCountSuffix(scope: LiveCountScope, position: string | null): string {
  // Map the specific position (e.g. "CM", "LB") to a broad category
  // ("midfielders", "defenders") so the copy never reads "cms".
  const category = positionCategory(position)
  if (scope === 'local') {
    return `coaches recruiting ${category ?? 'your position'} near you this week.`
  }
  // Widened: position-level demand across the non-league pyramid over 30 days.
  return `coaches recruiting ${category ?? 'players'} across Steps 2–7 this month.`
}
