'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-browser'
import Breadcrumb from '@/app/components/Breadcrumb'
import AgentBadge, { isAgent } from '@/app/components/AgentBadge'
import ActivityChip from '@/app/components/ActivityChip'
import { getActivityTier } from '@/lib/activityRecency'
import { MESSAGE_PACK_CREDITS, MESSAGE_PACK_PRICE_GBP } from '@/lib/message-pack'
import { REFUND_AFTER_DAYS, REFUND_PROMISE } from '@/lib/messageCredits'

// ─── Types ────────────────────────────────────────────────────────────────────

type CoachProfile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  club: string | null
  city: string | null
  coaching_role: string | null
  coaching_level: string | null
  coaching_history: string | null
  last_active: string | null
  role: string | null
  is_agent: boolean | null
}

type Opportunity = {
  id: string
  title: string
  position: string | null
  location: string | null
  level: string | null
  created_at: string
}

type ViewerProfile = {
  id: string
  role: string
  premium: boolean
}

type QuotaData = {
  messagesUsed: number
  messagesLimit: number
  periodEnd: string | null
  purchasedCredits: number
  hasExisting: boolean
  cooldownUntil: string | null
  coachInitiated: boolean
  /** Set once the no-reply guarantee has paid out on this thread. */
  creditRefundedAt: string | null
  /** When the refund is due, if it hasn't landed yet. */
  refundDueAt: string | null
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid #1e2235' }}>
      <span className="text-xs uppercase tracking-wider" style={{ color: '#8892aa' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: value ? '#e8dece' : '#8892aa' }}>{value ?? '—'}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CoachPublicProfile() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [coach, setCoach] = useState<CoachProfile | null>(null)
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [viewer, setViewer] = useState<ViewerProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [quotaData, setQuotaData] = useState<QuotaData | null>(null)
  const [quotaLoading, setQuotaLoading] = useState(true)
  const [initiating, setInitiating] = useState(false)
  const [dormantAcknowledged, setDormantAcknowledged] = useState(false)

  const [toast, setToast] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/'); return }

        const [coachRes, viewerRes, oppsRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, full_name, avatar_url, club, city, coaching_role, coaching_level, coaching_history, last_active, role, is_agent, approved')
            .eq('id', id)
            .eq('role', 'coach')
            .single(),
          supabase
            .from('profiles')
            .select('id, role, premium')
            .eq('id', user.id)
            .single(),
          supabase
            .from('opportunities')
            .select('id, title, position, location, level, created_at')
            .eq('coach_id', id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(10),
        ])

        if (coachRes.error || !coachRes.data) {
          setLoadError('Coach profile not found.')
          setLoading(false)
          return
        }

        const viewerProfile = viewerRes.data as ViewerProfile

        // Revoked (declined) coaches are hidden from everyone except admins and
        // themselves — otherwise a saved link keeps the profile (and its message
        // button) live after access was pulled.
        if (
          coachRes.data.approved === false &&
          viewerProfile?.role !== 'admin' &&
          user.id !== id
        ) {
          setLoadError('Coach profile not found.')
          setLoading(false)
          return
        }

        setCoach(coachRes.data as CoachProfile)
        setViewer(viewerProfile)
        setOpportunities((oppsRes.data ?? []) as Opportunity[])
        setLoading(false)

        if (viewerProfile && viewerProfile.id !== id) {
          supabase.from('player_views').insert({
            player_id: id,
            viewer_id: viewerProfile.id,
            viewer_role: viewerProfile.role,
            viewed_at: new Date().toISOString(),
          }).then(() => {})
        }

        const viewerIsPlayer = viewerProfile?.role === 'player' || viewerProfile?.role === 'admin'
        if (viewerIsPlayer && viewerProfile.id !== id) {
          setQuotaLoading(true)
          const [quotaRes, convRes] = await Promise.all([
            fetch('/api/messages/quota').then(r => r.json()),
            supabase
              .from('conversations')
              .select('id, initiated_by, coach_replied_at, credit_refunded_at, created_at')
              .eq('coach_id', id)
              .eq('player_id', user.id)
              .maybeSingle(),
          ])

          const conv = convRes.data as {
            id: string
            initiated_by: string | null
            coach_replied_at: string | null
            credit_refunded_at: string | null
            created_at: string
          } | null

          let cooldownUntil: string | null = null
          let coachInitiated = false
          let creditRefundedAt: string | null = null
          let refundDueAt: string | null = null

          if (conv) {
            if (conv.initiated_by === id) {
              coachInitiated = true
            } else if (!conv.coach_replied_at) {
              const cooldownEnd = new Date(conv.created_at)
              cooldownEnd.setMonth(cooldownEnd.getMonth() + 3)
              if (cooldownEnd > new Date()) {
                cooldownUntil = cooldownEnd.toISOString()
              }
              // Two clocks on the same silence: the credit comes back in days,
              // the door to this coach reopens in months.
              creditRefundedAt = conv.credit_refunded_at
              refundDueAt = conv.credit_refunded_at
                ? null
                : new Date(new Date(conv.created_at).getTime() + REFUND_AFTER_DAYS * 86400000).toISOString()
            }
          }

          setQuotaData({
            messagesUsed: quotaRes.messagesUsed ?? 0,
            messagesLimit: quotaRes.messagesLimit ?? 3,
            periodEnd: quotaRes.periodEnd ?? null,
            purchasedCredits: quotaRes.purchasedCredits ?? 0,
            hasExisting: !!conv,
            cooldownUntil,
            coachInitiated,
            creditRefundedAt,
            refundDueAt,
          })
          setQuotaLoading(false)
        } else {
          setQuotaLoading(false)
        }
      } catch (err) {
        console.error('Error loading coach profile:', err)
        setLoadError('Something went wrong loading this profile.')
        setLoading(false)
        setQuotaLoading(false)
      }
    }
    load()
  }, [id])

  // Messages cost the player — a monthly allowance or a purchased credit. If a
  // coach hasn't been near the app in a month, spending one on them is the most
  // likely way to feel ripped off by the product. Warn once, then get out of
  // the way: it's their credit and some approaches are worth the long shot.
  const coachDormant = coach ? getActivityTier(coach.last_active) === null : false

  async function handleInitiate() {
    if (initiating) return
    if (coachDormant && !dormantAcknowledged) {
      setDormantAcknowledged(true)
      return
    }
    setInitiating(true)
    try {
      const res = await fetch('/api/messages/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: id }),
      })
      const data = await res.json()
      if (res.ok) {
        router.push('/dashboard/player/messages')
        return
      }
      if (data.error === 'QUOTA_EXHAUSTED') {
        setToast('No messages remaining. Buy Extra Messages to continue.')
        setTimeout(() => setToast(''), 4000)
      } else if (data.error === 'COOLDOWN_ACTIVE') {
        setToast('You\'ve already reached out to this coach. Check back later.')
        setTimeout(() => setToast(''), 4000)
      } else if (data.error === 'QUOTA_NOT_FOUND' || data.error === 'Failed to create message quota') {
        setToast('Could not load your message quota. Please refresh and try again.')
        setTimeout(() => setToast(''), 5000)
      } else if (data.error === 'NOT_PREMIUM') {
        setToast('Premium required to message coaches.')
        setTimeout(() => setToast(''), 4000)
      } else {
        setToast('Something went wrong. Please try again.')
        setTimeout(() => setToast(''), 3000)
      }
    } catch {
      setToast('Something went wrong. Please try again.')
      setTimeout(() => setToast(''), 3000)
    }
    setInitiating(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (loadError || !coach) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ backgroundColor: '#0a0a0a' }}>
        <p className="text-sm text-center" style={{ color: '#8892aa' }}>{loadError ?? 'Profile not found.'}</p>
        <button onClick={() => router.back()} className="text-sm" style={{ color: '#2d5fc4' }}>← Go back</button>
      </div>
    )
  }

  const initials = coach.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'
  const subtitle = [coach.coaching_role, coach.club].filter(Boolean).join(' · ') || 'Coach'
  const isOwnProfile = viewer?.id === coach.id
  const viewerIsPlayer = viewer?.role === 'player' || viewer?.role === 'admin'
  const firstName = coach.full_name?.split(' ')[0] ?? 'Coach'

  const backHref = viewerIsPlayer ? '/dashboard/player' : '/dashboard/coach'

  // Derived quota state
  const periodExhausted = quotaData ? quotaData.messagesUsed >= quotaData.messagesLimit : false
  const hasPurchased = (quotaData?.purchasedCredits ?? 0) > 0
  const canMessage = !periodExhausted || hasPurchased
  const totalRemaining = quotaData
    ? Math.max(0, quotaData.messagesLimit - quotaData.messagesUsed) + (quotaData.purchasedCredits ?? 0)
    : 0

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg"
          style={{ backgroundColor: '#13172a', border: '1px solid #2d5fc4', color: '#e8dece', whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 32px)' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-3 pb-3 flex items-center gap-3"
        style={{ borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[
          { label: 'Home', href: backHref },
          { label: coach.full_name ?? 'Coach' },
        ]} />
        <ActivityChip lastActive={coach.last_active} className="ml-auto" />
      </div>

      {/* Hero */}
      <div className="flex flex-col items-center px-6 pt-7 pb-5 text-center">
        <div className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center mb-4"
          style={{ border: '3px solid #2d5fc4', backgroundColor: '#1a1f3a' }}>
          {coach.avatar_url ? (
            <Image src={coach.avatar_url} alt={coach.full_name ?? ''} width={112} height={112} className="w-full h-full object-cover object-center" />
          ) : (
            <span className="font-black text-4xl"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
              {initials}
            </span>
          )}
        </div>

        <h1 className="text-3xl font-black uppercase leading-none"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
          {coach.full_name ?? 'Coach'}
        </h1>
        {isAgent(coach) && (
          <div className="mt-2 flex justify-center">
            <AgentBadge />
          </div>
        )}
        <p className="text-sm mt-1.5" style={{ color: '#8892aa' }}>{subtitle}</p>

        {isOwnProfile && (
          <Link href="/dashboard/profile"
            className="mt-5 flex items-center justify-center gap-2 w-full rounded-2xl py-3 text-sm font-bold uppercase tracking-wider"
            style={{ border: '1px solid #2d5fc4', color: '#2d5fc4', textDecoration: 'none' }}>
            Edit Your Profile
          </Link>
        )}

        {/* ── Message section for players ─────────────────────────────────── */}
        {viewerIsPlayer && !isOwnProfile && (
          <div className="w-full mt-5 space-y-3">

            {/* State A: free player */}
            {!viewer?.premium && (
              <div className="space-y-2">
                <Link
                  href="/dashboard/player/premium"
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold"
                  style={{ border: '1px solid #1e2235', backgroundColor: '#13172a', color: '#e8dece', textDecoration: 'none' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Message {firstName} — Premium Only
                </Link>
                <p className="text-xs" style={{ color: '#8892aa' }}>
                  Upgrade to Player Premium to message coaches directly
                </p>
              </div>
            )}

            {/* State B: loading */}
            {viewer?.premium && quotaLoading && (
              <div className="flex items-center justify-center py-3">
                <div className="w-5 h-5 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
              </div>
            )}

            {viewer?.premium && !quotaLoading && quotaData && (
              <>
                {/* State C: existing conversation, coach replied or coach initiated — just continue */}
                {quotaData.hasExisting && (quotaData.coachInitiated || !quotaData.cooldownUntil) && (
                  <div className="space-y-2">
                    <Link
                      href="/dashboard/player/messages"
                      className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold"
                      style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                      Continue Conversation →
                    </Link>
                    {!quotaData.coachInitiated && (
                      <p className="text-xs" style={{ color: '#8892aa' }}>
                        {firstName} has replied — conversation is open
                      </p>
                    )}
                  </div>
                )}

                {/* State C2: player initiated, coach hasn't replied, within cooldown */}
                {quotaData.hasExisting && !quotaData.coachInitiated && quotaData.cooldownUntil && (
                  <div className="space-y-3">
                    <Link
                      href="/dashboard/player/messages"
                      className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold"
                      style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}>
                      View Conversation →
                    </Link>
                    <div className="rounded-xl px-4 py-3 text-left space-y-1"
                      style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                      <p className="text-xs font-semibold" style={{ color: '#e8dece' }}>
                        {quotaData.creditRefundedAt
                          ? 'Your credit is back'
                          : `Awaiting ${firstName}'s reply`}
                      </p>
                      {/* The credit is the part the player actually cares about
                          while they wait, so it leads. The cooldown on this
                          particular coach is a footnote underneath it. */}
                      <p className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>
                        {quotaData.creditRefundedAt ? (
                          <>
                            {firstName} didn&apos;t reply within {REFUND_AFTER_DAYS} days, so we&apos;ve put
                            your message credit back in your account — spend it on another club.
                          </>
                        ) : quotaData.refundDueAt && daysUntil(quotaData.refundDueAt) > 0 ? (
                          <>
                            You&apos;ve already reached out. If {firstName} hasn&apos;t replied in{' '}
                            {daysUntil(quotaData.refundDueAt)} more day{daysUntil(quotaData.refundDueAt) !== 1 ? 's' : ''},
                            we&apos;ll put your message credit back so you can spend it elsewhere.
                          </>
                        ) : (
                          <>
                            You&apos;ve already reached out. {firstName} hasn&apos;t replied — your message
                            credit is on its way back to your account.
                          </>
                        )}
                      </p>
                      <p className="text-xs leading-relaxed pt-1" style={{ color: '#4b5563' }}>
                        You can approach {firstName} again in {daysUntil(quotaData.cooldownUntil)} day
                        {daysUntil(quotaData.cooldownUntil) !== 1 ? 's' : ''}.
                      </p>
                    </div>
                  </div>
                )}

                {/* State D: no existing conversation, has period or purchased credits */}
                {!quotaData.hasExisting && canMessage && (
                  <div className="space-y-2">
                    {coachDormant && dormantAcknowledged && (
                      <div className="rounded-xl px-4 py-3 text-left space-y-1"
                        style={{ backgroundColor: '#13172a', border: '1px solid rgba(245,158,11,0.35)' }}>
                        <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>
                          {firstName} hasn&apos;t been active in the last month
                        </p>
                        <p className="text-xs leading-relaxed" style={{ color: '#8892aa' }}>
                          They may not see this. It uses one of your messages now — and comes
                          back in {REFUND_AFTER_DAYS} days if they don&apos;t reply.
                          Tap again to send it anyway.
                        </p>
                      </div>
                    )}
                    <button
                      onClick={handleInitiate}
                      disabled={initiating}
                      className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold transition-colors"
                      style={{ backgroundColor: initiating ? '#1e2a4a' : '#2d5fc4', color: '#fff' }}>
                      {initiating
                        ? 'Opening…'
                        : coachDormant && dormantAcknowledged
                          ? 'Send anyway'
                          : `Message ${firstName}`}
                    </button>

                    {/* Credit status pill */}
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                      {!periodExhausted ? (
                        <span className="text-xs px-3 py-1 rounded-full"
                          style={{ backgroundColor: 'rgba(45,95,196,0.12)', color: '#8892aa' }}>
                          {quotaData.messagesLimit - quotaData.messagesUsed} of {quotaData.messagesLimit} monthly messages left
                          {quotaData.periodEnd && (
                            <> · resets {new Date(quotaData.periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs px-3 py-1 rounded-full"
                          style={{ backgroundColor: 'rgba(45,95,196,0.12)', color: '#2d5fc4' }}>
                          Using Extra Messages · {quotaData.purchasedCredits} remaining
                        </span>
                      )}
                    </div>

                    {/* Show purchased balance when they have both */}
                    {!periodExhausted && hasPurchased && (
                      <p className="text-xs text-center" style={{ color: '#8892aa' }}>
                        + {quotaData.purchasedCredits} Extra Message{quotaData.purchasedCredits !== 1 ? 's' : ''} in reserve
                      </p>
                    )}

                    {/* The guarantee, at the exact moment the credit is at risk.
                        This is the point where a player hesitates — "what if he
                        never answers" — and it's the honest answer. */}
                    <div className="flex items-start justify-center gap-2 pt-1">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4d8ae8"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className="flex-shrink-0 mt-0.5">
                        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                        <path d="M3 3v5h5" />
                      </svg>
                      <p className="text-xs leading-relaxed text-center" style={{ color: '#8892aa' }}>
                        {REFUND_PROMISE}
                      </p>
                    </div>
                  </div>
                )}

                {/* State E: both exhausted — buy more CTA */}
                {!quotaData.hasExisting && !canMessage && (
                  <div className="space-y-3">
                    <button
                      disabled
                      className="w-full flex items-center justify-center rounded-2xl py-3 text-sm font-bold cursor-not-allowed"
                      style={{ backgroundColor: '#1e2235', color: '#8892aa' }}>
                      No outreach messages remaining
                    </button>

                    {/* Buy Extra Messages card */}
                    <Link
                      href="/dashboard/player/extra-messages"
                      className="block rounded-2xl overflow-hidden"
                      style={{ textDecoration: 'none', border: '1px solid rgba(45,95,196,0.4)', background: 'linear-gradient(135deg, rgba(45,95,196,0.15) 0%, rgba(45,95,196,0.06) 100%)' }}>
                      <div className="px-4 py-4 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: 'rgba(45,95,196,0.2)' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ color: '#e8dece' }}>
                            Get Extra Messages
                          </p>
                          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#8892aa' }}>
                            {MESSAGE_PACK_CREDITS} outreach credits for {MESSAGE_PACK_PRICE_GBP}. Stack them up — they never expire.
                          </p>
                        </div>
                        <svg className="flex-shrink-0 mt-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </div>
                      <div className="px-4 py-2.5 flex items-center justify-between"
                        style={{ borderTop: '1px solid rgba(45,95,196,0.2)', backgroundColor: 'rgba(45,95,196,0.06)' }}>
                        <span className="text-xs font-semibold" style={{ color: '#2d5fc4' }}>
                          Monthly messages reset {quotaData.periodEnd
                            ? new Date(quotaData.periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                            : 'next billing date'}
                        </span>
                        <span className="text-xs font-bold" style={{ color: '#2d5fc4' }}>
                          {MESSAGE_PACK_PRICE_GBP} →
                        </span>
                      </div>
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="px-4 space-y-4 pb-8">

        {/* Coaching Info */}
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e2235' }}>
            <h2 className="text-base font-bold uppercase"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>Coaching Info</h2>
          </div>
          <div className="px-4">
            <Row label="Role" value={coach.coaching_role} />
            <Row label="Level" value={coach.coaching_level} />
            <Row label="Club / Organisation" value={coach.club} />
            <Row label="Location" value={coach.city} />
          </div>
        </div>

        {/* Coaching History */}
        {coach.coaching_history && (
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <h2 className="text-base font-bold uppercase mb-3"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>Coaching History</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#8892aa' }}>{coach.coaching_history}</p>
          </div>
        )}

        {/* Active Opportunities */}
        {opportunities.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-base font-bold uppercase"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
              Open Opportunities
            </h2>
            {opportunities.map(opp => (
              <div key={opp.id} className="rounded-2xl p-4 space-y-1"
                style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
                <p className="text-sm font-bold" style={{ color: '#e8dece' }}>{opp.title}</p>
                <p className="text-xs" style={{ color: '#8892aa' }}>
                  {[opp.position, opp.level, opp.location].filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Privacy note */}
        {!isOwnProfile && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3"
            style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" />
            </svg>
            <p className="text-xs" style={{ color: '#8892aa' }}>
              Phone &amp; email are private. Premium players can message coaches directly.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
