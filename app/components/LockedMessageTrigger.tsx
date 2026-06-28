'use client'

import { useState } from 'react'
import { PREMIUM_PRICE_PER_MONTH, PREMIUM_PRICE_WEEKLY_LOWER, PREMIUM_PRICE_WEEKLY, PROOF_LINE, MODAL_BULLETS } from '@/lib/premiumContent'

type Props = {
  /** Coach's club step to reveal — only set when it's a strong signal. */
  revealedStep: string | null
  /** Timestamp of the latest message (for "Sent X ago"). */
  sentAt: string
  /** Total coaches who've messaged (for the "N waiting" line when > 1). */
  totalWaiting: number
  onBack: () => void
}

function sentAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 90) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
  if (diff < 7200) return 'an hour ago'
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  const days = Math.floor(diff / 86400)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return `on ${new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

/**
 * Locked inbound-message trigger (§3) — the strongest conversion moment on the
 * platform: a coach wants this player and they can't read it. Fires when a
 * non-premium player taps a locked conversation.
 *
 * SECURITY: the real message body is never sent to a non-premium client (gated
 * server-side in step 2). The blurred preview below is SYNTHETIC — fake lines
 * that imply real text exists. Do not render real content here.
 */
export default function LockedMessageTrigger({ revealedStep, sentAt, totalWaiting, onBack }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleUnlock() {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) { window.location.href = data.url; return }
    } catch { /* fall through */ }
    // Fallback to the premium page if checkout couldn't start.
    window.location.href = '/dashboard/player/premium'
  }

  const proof = revealedStep
    ? `A coach from a ${revealedStep} club messaged you.`
    : 'A coach messaged you.'

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      {/* Header with back */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ backgroundColor: 'rgba(10,10,10,0.97)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #1e2235' }}>
        <button onClick={onBack} style={{ color: '#8892aa' }} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
        <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Message request</p>
      </div>

      <div className="flex-1 px-5 pt-6 pb-8 flex flex-col">
        {/* Social proof — step only if strong, never club name/crest */}
        <p className="text-sm font-semibold mb-1" style={{ color: '#3a6fda' }}>{proof}</p>
        <p className="text-xs mb-5" style={{ color: '#8892aa' }}>Sent {sentAgo(sentAt)}</p>

        {/* Blurred (synthetic) message preview with lock overlay */}
        <div className="relative rounded-2xl p-4 mb-6 overflow-hidden"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <div aria-hidden style={{ filter: 'blur(7px)', userSelect: 'none', pointerEvents: 'none' }} className="space-y-2">
            <div className="h-3 rounded" style={{ backgroundColor: '#2a3150', width: '92%' }} />
            <div className="h-3 rounded" style={{ backgroundColor: '#2a3150', width: '78%' }} />
            <div className="h-3 rounded" style={{ backgroundColor: '#2a3150', width: '85%' }} />
            <div className="h-3 rounded" style={{ backgroundColor: '#2a3150', width: '40%' }} />
          </div>
          {/* Lock chip */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(10,10,10,0.7)', border: '1px solid #1e2235' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e8dece" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="text-xs font-semibold" style={{ color: '#e8dece' }}>Locked</span>
            </div>
          </div>
        </div>

        {/* Headline */}
        <h1 className="font-black uppercase mb-2" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', fontSize: 26, lineHeight: 1.05, letterSpacing: '0.02em' }}>
          This coach wants to talk to you.
        </h1>
        {totalWaiting > 1 && (
          <p className="text-sm mb-2" style={{ color: '#8892aa' }}>
            You have {totalWaiting} messages from coaches waiting.
          </p>
        )}

        {/* Proof line — fills the void with the canonical 3× stat */}
        <p className="text-sm font-semibold mt-4 mb-4" style={{ color: '#e8dece' }}>
          {PROOF_LINE}
        </p>

        {/* Three benefit bullets with ticks */}
        <ul className="space-y-2.5 mb-5">
          {MODAL_BULLETS.map((bullet) => (
            <li key={bullet} className="flex items-start gap-2.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a6fda" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5" aria-hidden>
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="text-sm" style={{ color: '#e8dece' }}>{bullet}</span>
            </li>
          ))}
        </ul>

        <div className="flex-1" />

        {/* Price anchor — sits directly above the CTA */}
        <p className="text-center text-sm font-semibold mb-2.5" style={{ color: '#e8dece' }}>
          {PREMIUM_PRICE_WEEKLY}. Cancel anytime.
        </p>

        {/* CTA → Stripe checkout */}
        <button
          onClick={handleUnlock}
          disabled={loading}
          className="w-full py-3.5 rounded-xl text-base font-bold disabled:opacity-60"
          style={{ backgroundColor: '#2d5fc4', color: '#fff' }}
        >
          {loading ? 'Starting checkout…' : `Unlock it · ${PREMIUM_PRICE_PER_MONTH}`}
        </button>
        <p className="text-center text-xs mt-2" style={{ color: '#8892aa' }}>
          Go Premium to read and reply. {PREMIUM_PRICE_WEEKLY_LOWER.charAt(0).toUpperCase() + PREMIUM_PRICE_WEEKLY_LOWER.slice(1)}.
        </p>
      </div>
    </div>
  )
}
