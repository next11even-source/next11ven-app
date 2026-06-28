'use client'

import { useEffect, useRef, useState } from 'react'
import { PROOF_LINE, liveCountSuffix, type LiveCountScope } from '@/lib/premiumContent'

type LiveCount = { n: number; scope: LiveCountScope; position: string | null }

type Props = {
  /** Visual weight. `hero` = big accent number (modal hero / premium banner). */
  size?: 'hero' | 'inline'
  /** Pre-fetched value. If omitted, the component fetches it itself on mount. */
  value?: LiveCount | null
  /** When the count is too thin (null), show the static proof line instead. */
  fallbackToProof?: boolean
  className?: string
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Count-up from 0 → target on mount; instant (duration 0) if reduced-motion. */
function useCountUp(target: number | null, durationMs = 700) {
  const [display, setDisplay] = useState(target ?? 0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (target == null) return
    const duration = prefersReducedMotion() ? 0 : durationMs
    const start = performance.now()
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(target * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, durationMs])

  return display
}

export default function LiveCoachCount({ size = 'inline', value, fallbackToProof = true, className }: Props) {
  const [data, setData] = useState<LiveCount | null | undefined>(value)
  const selfFetch = value === undefined

  useEffect(() => {
    if (!selfFetch) return
    let alive = true
    fetch('/api/player/actively-looking')
      .then(r => r.json())
      .then(d => { if (alive) setData(d.liveCount ?? null) })
      .catch(() => { if (alive) setData(null) })
    return () => { alive = false }
  }, [selfFetch])

  // value prop drives display when provided
  const resolved = selfFetch ? data : value

  const display = useCountUp(resolved?.n ?? null)

  // Still loading (self-fetch, not yet resolved) → render nothing to avoid flash.
  if (selfFetch && data === undefined) return null

  if (!resolved) {
    if (!fallbackToProof) return null
    return (
      <p
        className={className}
        style={{ color: '#e8dece', fontWeight: 600, fontSize: size === 'hero' ? 15 : 14, lineHeight: 1.4 }}
      >
        {PROOF_LINE}
      </p>
    )
  }

  const suffix = liveCountSuffix(resolved.scope, resolved.position)

  if (size === 'hero') {
    return (
      <p className={className} style={{ color: '#e8dece', lineHeight: 1.2 }}>
        <span
          className="font-black"
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: '#3a6fda', fontSize: 40, marginRight: 8, display: 'inline-block', verticalAlign: '-2px' }}
        >
          {display}
        </span>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{suffix}</span>
      </p>
    )
  }

  return (
    <p className={className} style={{ color: '#e8dece', fontWeight: 600, fontSize: 14, lineHeight: 1.4 }}>
      <span style={{ color: '#3a6fda', fontWeight: 800 }}>{display}</span> {suffix}
    </p>
  )
}
