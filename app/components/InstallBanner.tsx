'use client'

import { useEffect, useState } from 'react'

export default function InstallBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Don't show if already dismissed, or if running as installed PWA
    const dismissed = localStorage.getItem('install_banner_dismissed')
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && (window.navigator as Navigator & { standalone?: boolean }).standalone === true)

    if (!dismissed && !isStandalone) {
      // Small delay so it doesn't flash immediately on page load
      const t = setTimeout(() => setVisible(true), 1500)
      return () => clearTimeout(t)
    }
  }, [])

  function dismiss() {
    localStorage.setItem('install_banner_dismissed', '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
        onClick={dismiss}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-6 pt-6 pb-10 space-y-5"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full mx-auto" style={{ backgroundColor: '#1e2235' }} />

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/next11ven_square_logo.png" alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
            <div>
              <p className="text-base font-black uppercase tracking-widest"
                style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}>
                Add to Home Screen
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#8892aa' }}>Use NEXT11VEN like an app</p>
            </div>
          </div>
          <button onClick={dismiss} className="flex-shrink-0 p-1 -mt-0.5" style={{ color: '#8892aa' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {[
            { step: '1', text: 'Tap the Share button at the bottom of your browser' },
            { step: '2', text: 'Scroll down and tap "Add to Home Screen"' },
            { step: '3', text: 'Tap "Add" — NEXT11VEN will appear on your home screen' },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5"
                style={{ backgroundColor: 'rgba(45,95,196,0.15)', color: '#2d5fc4', border: '1px solid rgba(45,95,196,0.3)' }}>
                {step}
              </span>
              <p className="text-sm leading-snug" style={{ color: '#e8dece' }}>{text}</p>
            </div>
          ))}
        </div>

        {/* Share icon hint */}
        <div className="rounded-xl px-4 py-3 flex items-center gap-3"
          style={{ backgroundColor: 'rgba(45,95,196,0.08)', border: '1px solid rgba(45,95,196,0.2)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2d5fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          <p className="text-xs" style={{ color: '#8892aa' }}>
            Look for the <span style={{ color: '#e8dece', fontWeight: 600 }}>share icon</span> in Safari's toolbar
          </p>
        </div>

        <button
          onClick={dismiss}
          className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-widest"
          style={{ backgroundColor: '#2d5fc4', color: '#fff', fontFamily: "'Barlow Condensed', sans-serif" }}
        >
          Got It
        </button>
      </div>
    </>
  )
}
