'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function PendingPage() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <div className="w-full max-w-sm space-y-10 text-center">

        {/* Logo */}
        <div className="flex justify-center">
          <img
            src="/logo.jpg"
            alt="NEXT11VEN"
            className="w-48 h-auto"
          />
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8 space-y-6"
          style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
        >
          {/* Clock icon */}
          <div
            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(45,95,196,0.15)' }}
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#2d5fc4"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>

          <div className="space-y-2">
            <h2
              className="text-xl font-bold uppercase"
              style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
            >
              Application Under Review
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
              Your application has been received. Our team is reviewing your
              profile and will approve your account shortly.
            </p>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full rounded-full py-3 text-sm uppercase tracking-wider transition-colors"
            style={{ border: '1px solid #1e2235', color: '#8892aa', backgroundColor: 'transparent' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#e8dece'
              e.currentTarget.style.color = '#e8dece'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#1e2235'
              e.currentTarget.style.color = '#8892aa'
            }}
          >
            Sign Out
          </button>
        </div>

      </div>
    </div>
  )
}
