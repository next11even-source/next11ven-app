'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import CoachSidebar from '@/app/dashboard/coach/_components/CoachSidebar'
import Breadcrumb from '@/app/components/Breadcrumb'

const COACH_FEATURES = [
  { icon: '💬', text: 'Message any player — they receive it instantly' },
  { icon: '∞',  text: 'Unlimited messages & enquiries' },
  { icon: '📋', text: 'Post unlimited opportunities + receive applications faster' },
  { icon: '🔝', text: 'Priority visibility on the platform' },
  { icon: '📁', text: 'Save players to folders & get alerted when they become available' },
  { icon: '🏅', text: 'Verified Coach Pro badge on your profile' },
]

export default function CoachPremiumPage() {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [coachProfile, setCoachProfile] = useState<{ full_name: string | null; avatar_url: string | null; coaching_role: string | null } | null>(null)
  const [premium, setPremium] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/'); return }
      supabase.from('profiles').select('role, premium, full_name, avatar_url, coaching_role').eq('id', user.id).single().then(({ data }) => {
        if (data?.role !== 'coach') { router.push('/dashboard/player/premium'); return }
        setPremium(data.premium ?? false)
        setCoachProfile({ full_name: data.full_name, avatar_url: data.avatar_url, coaching_role: data.coaching_role })
        setLoading(false)
      })
    })
  }, [])

  async function handleCheckout() {
    setCheckoutLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'Something went wrong. Please try again.')
        setCheckoutLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setCheckoutLoading(false)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'Something went wrong.')
        setPortalLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#0a0a0a' }}>
        <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: '#2d5fc4', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  return (
    <>
      <CoachSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} profile={coachProfile} />
      <div className="min-h-screen pb-24" style={{ backgroundColor: '#0a0a0a' }}>
        {/* Header */}
        <div className="px-2 pt-4 pb-2 flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} className="flex flex-col gap-1.5 flex-shrink-0 ml-2" style={{ width: 20 }}>
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#8892aa', width: 14 }} />
            <span className="block h-0.5 rounded" style={{ backgroundColor: '#e8dece', width: 20 }} />
          </button>
          <Breadcrumb crumbs={[
            { label: 'Home', href: '/dashboard/coach' },
            { label: 'Coach Pro' },
          ]} />
        </div>

        <div className="px-4 space-y-5">
          {/* Hero card */}
          <div className="rounded-2xl overflow-hidden relative" style={{ background: 'linear-gradient(135deg, #0a2e1a 0%, #16a34a 60%, #14532d 100%)', padding: '28px 24px' }}>
            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />
            <div className="absolute -bottom-10 -left-6 w-28 h-28 rounded-full opacity-10" style={{ backgroundColor: '#fff' }} />

            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
              NEXT11VEN
            </p>
            <p className="text-3xl font-black uppercase leading-none mb-1"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#fff' }}>
              Coach Pro
            </p>
            <p className="text-xs uppercase tracking-widest mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Recruit faster. Move quicker.
            </p>
            <p className="text-5xl font-black" style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#fff' }}>
              £9.99
              <span className="text-lg font-normal ml-1" style={{ color: 'rgba(255,255,255,0.55)' }}>/month</span>
            </p>

            {premium && (
              <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-xs font-bold" style={{ color: '#fff' }}>Active subscription</span>
              </div>
            )}
          </div>

          {/* Feature list */}
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}>
            <div className="px-5 py-3" style={{ borderBottom: '1px solid #1e2235' }}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#8892aa' }}>
                What&apos;s included
              </p>
            </div>
            <ul className="divide-y" style={{ borderColor: '#1e2235' }}>
              {COACH_FEATURES.map((f, i) => (
                <li key={i} className="flex items-center gap-4 px-5 py-4">
                  <span className="text-xl w-7 text-center flex-shrink-0">{f.icon}</span>
                  <span className="text-sm font-medium leading-snug" style={{ color: '#e8dece' }}>{f.text}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: '#2d1010', border: '1px solid #7f1d1d', color: '#fca5a5' }}>
              {error}
            </div>
          )}

          {/* CTA */}
          {premium ? (
            <div className="space-y-3">
              <div className="rounded-2xl p-4 flex items-start gap-3" style={{ backgroundColor: '#0a1f12', border: '1px solid rgba(22,163,74,0.4)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-sm" style={{ color: '#8892aa' }}>
                  You&apos;re on an active plan. Use the button below to manage billing, update your payment method, or cancel.
                </p>
              </div>
              <button
                onClick={handlePortal}
                disabled={portalLoading}
                className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-center font-black text-base uppercase tracking-widest disabled:opacity-60"
                style={{ backgroundColor: '#13172a', color: '#e8dece', border: '1px solid #1e2235', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em' }}
              >
                {portalLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin inline-block" style={{ borderColor: '#e8dece', borderTopColor: 'transparent' }} />
                    Loading…
                  </span>
                ) : (
                  <>
                    Manage Subscription
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-center font-black text-base uppercase tracking-widest disabled:opacity-60"
              style={{ backgroundColor: '#16a34a', color: '#fff', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.08em' }}
            >
              {checkoutLoading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin inline-block" style={{ borderColor: '#fff', borderTopColor: 'transparent' }} />
                  Redirecting to checkout…
                </span>
              ) : (
                <>
                  Unlock Coach Pro
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="M12 8l4 4-4 4M8 12h8" />
                  </svg>
                </>
              )}
            </button>
          )}

          <p className="text-center text-xs pb-2" style={{ color: '#8892aa' }}>
            Cancel anytime · No long-term commitment · Secured by Stripe
          </p>
        </div>
      </div>
    </>
  )
}
