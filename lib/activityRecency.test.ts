import { describe, it, expect } from 'vitest'
import { getActivityTier, isRecentlyActive } from './activityRecency'

// Fixed reference point: 15 Aug 2026, 14:00 local.
const NOW = new Date(2026, 7, 15, 14, 0, 0).getTime()
const iso = (d: Date) => d.toISOString()
const hoursAgo = (h: number) => iso(new Date(NOW - h * 3600000))
const daysAgo = (d: number) => iso(new Date(NOW - d * 86400000))

describe('getActivityTier', () => {
  it('returns null for missing or unparseable input', () => {
    expect(getActivityTier(null, NOW)).toBeNull()
    expect(getActivityTier(undefined, NOW)).toBeNull()
    expect(getActivityTier('not-a-date', NOW)).toBeNull()
  })

  it('treats the same calendar day as today', () => {
    expect(getActivityTier(hoursAgo(1), NOW)).toBe('today')
    expect(getActivityTier(iso(new Date(2026, 7, 15, 0, 5, 0)), NOW)).toBe('today')
  })

  it('does not call the previous evening "today" even if under 24h', () => {
    // 23:00 the night before — 15h ago, but a different calendar day.
    expect(getActivityTier(iso(new Date(2026, 7, 14, 23, 0, 0)), NOW)).toBe('week')
  })

  it('tiers week and month by elapsed days', () => {
    expect(getActivityTier(daysAgo(3), NOW)).toBe('week')
    expect(getActivityTier(daysAgo(6.9), NOW)).toBe('week')
    expect(getActivityTier(daysAgo(7.1), NOW)).toBe('month')
    expect(getActivityTier(daysAgo(29), NOW)).toBe('month')
  })

  it('goes silent past 30 days rather than making a negative claim', () => {
    expect(getActivityTier(daysAgo(31), NOW)).toBeNull()
    expect(getActivityTier(daysAgo(400), NOW)).toBeNull()
  })

  it('treats a future timestamp as current (clock skew), not invalid', () => {
    expect(getActivityTier(iso(new Date(NOW + 3600000)), NOW)).toBe('today')
  })
})

describe('isRecentlyActive', () => {
  it('is true only for today and this week', () => {
    expect(isRecentlyActive(hoursAgo(2), NOW)).toBe(true)
    expect(isRecentlyActive(daysAgo(5), NOW)).toBe(true)
    expect(isRecentlyActive(daysAgo(20), NOW)).toBe(false)
    expect(isRecentlyActive(null, NOW)).toBe(false)
  })
})
