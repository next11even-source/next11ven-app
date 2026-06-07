'use client'

import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 text-center space-y-6"
        style={{ backgroundColor: '#13172a', border: '1px solid #1e2235' }}
      >
        <Link href="/" className="inline-block">
          <img src="/logo.jpg" alt="NEXT11VEN" className="h-10 w-auto mx-auto" />
        </Link>

        <div className="space-y-2">
          <p
            className="text-6xl font-black"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
          >
            404
          </p>
          <p className="text-lg font-bold uppercase tracking-wide" style={{ color: '#e8dece', fontFamily: "'Barlow Condensed', sans-serif" }}>
            Page not found
          </p>
          <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
            This page doesn&apos;t exist or has been moved.
          </p>
        </div>

        <Link
          href="/"
          className="block w-full py-3 rounded-xl font-bold text-sm text-white text-center transition-colors"
          style={{ backgroundColor: '#2d5fc4' }}
        >
          Back to NEXT11VEN
        </Link>
      </div>
    </div>
  )
}
