'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Breadcrumb from '@/app/components/Breadcrumb'
import { MESSAGE_PACK_CREDITS, MESSAGE_PACK_PRICE_GBP } from '@/lib/message-pack'

type QuotaState = {
  messagesUsed: number
  messagesLimit: number
  periodEnd: string | null
  purchasedCredits: number
}

function ExtraMessagesInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const justPurchased = searchParams.get('purchased') === 'true'

  const [quota, setQuota] = useState<QuotaState | null>(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/messages/quota')
      .then(r => r.json())
      .then(data => {
        setQuota({
          messagesUsed: data.messagesUsed ?? 0,
          messagesLimit: data.messagesLimit ?? 3,
          periodEnd: data.periodEnd ?? null,
          purchasedCredits: data.purchasedCredits ?? 0,
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function handleBuy() {
    if (buying) return
    setBuying(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout/message-pack', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setBuying(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Something went wrong. Please try again.')
      setBuying(false)
    }
  }

  const monthlyLeft = quota ? Math.max(0, quota.messagesLimit - quota.messagesUsed) : null
  const totalLeft = monthlyLeft !== null ? monthlyLeft + (quota?.purchasedCredits ?? 0) : null

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>

      {/* Header */}
      <div className="px-4 pt-3 pb-3" style={{ borderBottom: '1px solid #1e2235' }}>
        <Breadcrumb crumbs={[
          { label: 'Home', href: '/dashboard/player' },
          { label: 'Extra Messages' },
        ]} />
      </div>

      <div className="px-4 pt-6 pb-10 max-w-lg mx-auto space-y-5">

        {/* Success banner */}
        {justPurchased && (
          <div className="rounded-2xl px-4 py-4 flex items-start gap-3"
            style={{ backgroundColor: 'rgba(45,95,196,0.12)', border: '1px solid rgba(45,95,196,0.4)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div>
              <p className="text-sm font-bold" style={{ color: '#e8dece' }}>Credits added to your account</p>
              <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>
                Your {MESSAGE_PACK_CREDITS} Extra Messages are ready to use. They never expire.
              </p>
            </div>
          </div>
        )}

        {/* Title */}
        <div>
          <h1 className="text-3xl font-black uppercase leading-tight"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
            Extra Messages
          </h1>
          <p className="text-sm mt-1.5 leading-relaxed" style={{ color: '#8892aa' }}>
            Unlock additional coach outreach slots on top of your monthly allowance.
          </p>
        </div>

        {/* Current balance card */}
        {!loading && quota && (
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #1e2235' }}>
              <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>Your Balance</p>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#8892aa' }}>Monthly messages</span>
                <span className="text-sm font-bold" style={{ color: '#e8dece' }}>
                  {monthlyLeft} remaining
                  {quota.periodEnd && (
                    <span className="font-normal text-xs ml-1" style={{ color: '#8892aa' }}>
                      · resets {new Date(quota.periodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#8892aa' }}>Extra Messages</span>
                <span className="text-sm font-bold" style={{ color: quota.purchasedCredits > 0 ? '#2d5fc4' : '#8892aa' }}>
                  {quota.purchasedCredits} remaining
                </span>
              </div>
              <div className="pt-1" style={{ borderTop: '1px solid #1e2235' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: '#e8dece' }}>Total available</span>
                  <span className="text-base font-black" style={{ color: '#2d5fc4' }}>{totalLeft}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Purchase card */}
        <div className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(45,95,196,0.4)', background: 'linear-gradient(160deg, rgba(45,95,196,0.12) 0%, rgba(45,95,196,0.04) 100%)' }}>

          <div className="px-5 pt-5 pb-4">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-xl font-black uppercase" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                  {MESSAGE_PACK_CREDITS} Extra Messages
                </p>
                <p className="text-sm mt-0.5" style={{ color: '#8892aa' }}>One-time purchase · no subscription</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-2xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#2d5fc4' }}>
                  {MESSAGE_PACK_PRICE_GBP}
                </p>
              </div>
            </div>

            <div className="space-y-2.5 mb-5">
              {[
                `${MESSAGE_PACK_CREDITS} additional coach outreach slots`,
                'Credits stack — buy multiple packs',
                'Never expire, never reset',
                'Used only when your monthly allowance runs out',
              ].map(item => (
                <div key={item} className="flex items-start gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-sm" style={{ color: '#e8dece' }}>{item}</span>
                </div>
              ))}
            </div>

            {error && (
              <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ color: '#e8dece', backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
              </p>
            )}

            <button
              onClick={handleBuy}
              disabled={buying}
              className="w-full py-3.5 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all"
              style={{
                backgroundColor: buying ? '#1e2a4a' : '#2d5fc4',
                color: '#fff',
                cursor: buying ? 'not-allowed' : 'pointer',
              }}>
              {buying ? 'Redirecting to checkout…' : 'Unlock access to more clubs'}
            </button>
          </div>

          <div className="px-5 py-3 flex items-center gap-2"
            style={{ borderTop: '1px solid rgba(45,95,196,0.2)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8892aa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-xs" style={{ color: '#8892aa' }}>Secure checkout via Stripe. Your card details are never stored by us.</p>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
          <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#8892aa' }}>How it works</p>
          <div className="space-y-3">
            {[
              { n: '1', text: 'Your 3 monthly messages are always used first.' },
              { n: '2', text: 'When your monthly allowance runs out, Extra Messages kick in automatically.' },
              { n: '3', text: 'Each coach you first contact uses 1 credit. Replies within that thread are always free.' },
              { n: '4', text: 'Credits from multiple packs stack and never expire.' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: 'rgba(45,95,196,0.2)', color: '#2d5fc4' }}>
                  {n}
                </span>
                <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 pt-1">
          <Link href="/dashboard/player" className="text-xs" style={{ color: '#8892aa', textDecoration: 'none' }}>
            ← Back to dashboard
          </Link>
        </div>

      </div>
    </div>
  )
}

export default function ExtraMessagesPage() {
  return (
    <Suspense>
      <ExtraMessagesInner />
    </Suspense>
  )
}
