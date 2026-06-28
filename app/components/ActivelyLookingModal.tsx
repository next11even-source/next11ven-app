'use client'

import Link from 'next/link'
import LiveCoachCount from './LiveCoachCount'
import {
  MODAL_BULLETS,
  PROOF_LINE,
  PREMIUM_PRICE_PER_MONTH,
  PREMIUM_PRICE_WEEKLY,
} from '@/lib/premiumContent'

type Props = {
  open: boolean
  onClose: () => void
  /** Where the upgrade CTA points. Defaults to the Player Premium page. */
  premiumHref?: string
}

/**
 * Shared Actively Looking paywall (§2). Fires when a non-premium player reaches
 * for the Actively Looking toggle. Sells THAT impulse — the toggle is the
 * protagonist. Single source of truth: replaces the duplicated inline modals in
 * player/page.tsx and profile/page.tsx.
 */
export default function ActivelyLookingModal({ open, onClose, premiumHref = '/dashboard/player/premium' }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-t-2xl sm:rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header — icon + headline, with the live/ready green dot carried across */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center relative flex-shrink-0" style={{ backgroundColor: 'rgba(45,95,196,0.15)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
            {/* Pulsing green dot — the same "live / ready" signal from the toggle */}
            <span
              className="absolute animate-pulse"
              style={{ top: -1, right: -1, width: 10, height: 10, borderRadius: '50%', backgroundColor: '#22c55e', boxShadow: '0 0 10px rgba(34,197,94,0.7)', border: '2px solid #13172a' }}
            />
          </div>
          <h2 className="text-lg font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece', letterSpacing: '0.04em' }}>
            This is how coaches find you
          </h2>
        </div>

        {/* HERO — the live count, big, top of the body, animated on mount */}
        <LiveCoachCount size="hero" fallbackToProof={false} />

        {/* Proof line directly under the count (always shown — doubles as the
            fallback when the live count is too thin to render) */}
        <p className="text-sm font-medium" style={{ color: '#e8dece' }}>
          {PROOF_LINE}
        </p>

        {/* Sub-copy — one sentence */}
        <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
          Switch on Actively Looking and you&apos;ll appear in the carousel and free-agent searches coaches see first.
        </p>

        {/* Three bullets — reframed around the toggle moment */}
        <div className="space-y-2">
          {MODAL_BULLETS.map(b => (
            <div key={b} className="flex items-center gap-2.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-sm" style={{ color: '#e8dece' }}>{b}</span>
            </div>
          ))}
        </div>

        {/* CTA — references the toggle action they reached for */}
        <div className="space-y-2 pt-1">
          <Link
            href={premiumHref}
            className="block w-full text-center py-3 rounded-xl text-sm font-bold"
            style={{ backgroundColor: '#2d5fc4', color: '#fff', textDecoration: 'none' }}
          >
            Switch it on &middot; {PREMIUM_PRICE_PER_MONTH}
          </Link>
          <p className="text-center text-xs" style={{ color: '#8892aa' }}>
            {PREMIUM_PRICE_WEEKLY}. Cancel anytime.
          </p>
          <button onClick={onClose} className="w-full text-center py-2 text-sm" style={{ color: '#8892aa' }}>
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
