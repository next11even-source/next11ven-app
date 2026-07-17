import { describe, it, expect } from 'vitest'
import { likelyMatchWeekday, mostRecentWeekday, suggestedMatchDate } from './performance'

// Reference weekdays (UTC): 2026-07-18 is a Saturday.
//   Sat 2026-07-18, Sun 2026-07-19, Wed 2026-07-15, Tue 2026-07-14

describe('likelyMatchWeekday', () => {
  it('returns null below the 3-match confidence floor', () => {
    expect(likelyMatchWeekday(['2026-07-18', '2026-07-11'])).toBeNull()
    expect(likelyMatchWeekday([])).toBeNull()
  })

  it('finds the modal weekday once there is enough history', () => {
    // Three Saturdays, one Tuesday → Saturday (6)
    expect(likelyMatchWeekday(['2026-07-18', '2026-07-11', '2026-07-04', '2026-07-14'])).toBe(6)
  })

  it('picks a midweek pattern when that is the mode', () => {
    // Three Wednesdays → 3
    expect(likelyMatchWeekday(['2026-07-15', '2026-07-08', '2026-07-01'])).toBe(3)
  })
})

describe('mostRecentWeekday', () => {
  it('returns the same day when `from` is already that weekday', () => {
    const sat = new Date('2026-07-18T12:00:00Z')
    expect(mostRecentWeekday(6, sat)).toBe('2026-07-18')
  })

  it('walks back to the most recent occurrence', () => {
    const sun = new Date('2026-07-19T12:00:00Z')
    expect(mostRecentWeekday(6, sun)).toBe('2026-07-18') // yesterday's Saturday
    const mon = new Date('2026-07-20T12:00:00Z')
    expect(mostRecentWeekday(6, mon)).toBe('2026-07-18') // still last Saturday
  })
})

describe('suggestedMatchDate', () => {
  it('falls back to the most recent Saturday with no history', () => {
    const sun = new Date('2026-07-19T12:00:00Z')
    expect(suggestedMatchDate([], sun)).toBe('2026-07-18')
  })

  it('uses the derived weekday once a pattern exists', () => {
    const thu = new Date('2026-07-16T12:00:00Z')
    // Wednesday player → most recent Wednesday before Thu 16th is the 15th
    expect(suggestedMatchDate(['2026-07-15', '2026-07-08', '2026-07-01'], thu)).toBe('2026-07-15')
  })
})
