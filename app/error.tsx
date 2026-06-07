'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GlobalError]', error)
  }, [error])

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
            className="text-5xl font-black"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#e8dece' }}
          >
            Something went wrong
          </p>
          <p className="text-sm leading-relaxed" style={{ color: '#8892aa' }}>
            An unexpected error occurred. Try again — if it keeps happening, the team will be on it.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={reset}
            className="block w-full py-3 rounded-xl font-bold text-sm text-white transition-colors"
            style={{ backgroundColor: '#2d5fc4' }}
          >
            Try again
          </button>
          <Link
            href="/"
            className="block w-full py-3 rounded-xl font-bold text-sm transition-colors"
            style={{ backgroundColor: '#1e2235', color: '#e8dece' }}
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
