import { describe, it, expect } from 'vitest'
import { buildPublicPerformance, type PublicMatch, type PublicCareerRow } from './publicStats'

// Minimal PublicMatch factory — only the fields a test cares about, defaults
// for the rest (mirrors the allowlisted RPC payload shape).
function match(over: Partial<PublicMatch> & { match_date: string }): PublicMatch {
  return {
    competition_type: 'league',
    goals_for: 2, goals_against: 0,
    started: true, position: 'ST', minutes_played: 90,
    goals: 0, assists: 0, penalty_saves: 0, yellow_cards: 0, red_card: false,
    club_name: 'Test FC', club_level: 'Step 4', man_of_the_match: false,
    ...over,
  }
}

function career(over: Partial<PublicCareerRow> & { season_start_year: number }): PublicCareerRow {
  return {
    club_name: 'Old FC', level: 'Step 5', position: 'ST',
    apps: 10, goals: 5, assists: 3, minutes: 900, clean_sheets: 0,
    source: 'legacy_import',
    ...over,
  }
}

describe('buildPublicPerformance — visibility gate', () => {
  it('returns nothing renderable when not visible', () => {
    const out = buildPublicPerformance({ visible: false, matches: [match({ match_date: '2026-08-10' })] }, 'ST')
    expect(out.visible).toBe(false)
    expect(out.hasAny).toBe(false)
    expect(out.seasons).toHaveLength(0)
  })

  it('visible but empty = no data', () => {
    const out = buildPublicPerformance({ visible: true, matches: [], career: [] }, 'ST')
    expect(out.hasAny).toBe(false)
  })
})

describe('buildPublicPerformance — anti-double-count', () => {
  it('log-only season: renders from the log, source=log', () => {
    const out = buildPublicPerformance({
      visible: true,
      matches: [match({ match_date: '2025-09-01', goals: 1 }), match({ match_date: '2025-10-01', goals: 2 })],
      career: [],
    }, 'ST')
    expect(out.seasons).toHaveLength(1)
    expect(out.seasons[0].source).toBe('log')
    expect(out.seasons[0].seasonStartYear).toBe(2025)
    expect(out.seasons[0].apps).toBe(2)
    expect(out.seasons[0].goals).toBe(3)
    expect(out.seasons[0].selfReported).toBe(false)
  })

  it('career-only season: renders from career, flagged self-reported', () => {
    const out = buildPublicPerformance({
      visible: true,
      matches: [],
      career: [career({ season_start_year: 2022, apps: 20, goals: 8 })],
    }, 'ST')
    expect(out.seasons).toHaveLength(1)
    expect(out.seasons[0].source).toBe('career')
    expect(out.seasons[0].selfReported).toBe(true)
    expect(out.seasons[0].apps).toBe(20)
    expect(out.seasons[0].goals).toBe(8)
  })

  it('COLLISION: same season in both → log wins, career row dropped, no inflation', () => {
    const out = buildPublicPerformance({
      visible: true,
      // Log has 3 games in 2024/25 (3 goals total)
      matches: [
        match({ match_date: '2024-08-15', goals: 1 }),
        match({ match_date: '2024-09-15', goals: 1 }),
        match({ match_date: '2024-10-15', goals: 1 }),
      ],
      // Career ALSO claims 2024/25 (30 apps, 15 goals) — must be ignored
      career: [career({ season_start_year: 2024, apps: 30, goals: 15 })],
    }, 'ST')

    expect(out.seasons).toHaveLength(1)                // not two rows for one season
    expect(out.seasons[0].source).toBe('log')          // the log wins
    expect(out.seasons[0].apps).toBe(3)                // NOT 3 + 30
    expect(out.seasons[0].goals).toBe(3)               // NOT 3 + 15
    expect(out.totals.apps).toBe(3)                    // totals never double-count
    expect(out.totals.goals).toBe(3)
  })

  it('mixed history: log season + separate career season coexist, totals sum both', () => {
    const out = buildPublicPerformance({
      visible: true,
      matches: [match({ match_date: '2025-09-01', goals: 2 })],        // 2025/26 logged
      career: [career({ season_start_year: 2023, apps: 25, goals: 10 })], // 2023/24 career
    }, 'ST')
    expect(out.seasons).toHaveLength(2)
    expect(out.seasons[0].seasonStartYear).toBe(2025)   // newest first
    expect(out.seasons[1].seasonStartYear).toBe(2023)
    expect(out.totals.apps).toBe(1 + 25)
    expect(out.totals.goals).toBe(2 + 10)
  })

  it('collision only drops the overlapping career season, keeps non-overlapping ones', () => {
    const out = buildPublicPerformance({
      visible: true,
      matches: [match({ match_date: '2024-09-01', goals: 1 })],         // logs 2024/25
      career: [
        career({ season_start_year: 2024, apps: 40, goals: 20 }),        // overlaps → dropped
        career({ season_start_year: 2021, apps: 15, goals: 6 }),         // distinct → kept
      ],
    }, 'ST')
    const years = out.seasons.map(s => s.seasonStartYear)
    expect(years).toEqual([2024, 2021])
    expect(out.seasons.find(s => s.seasonStartYear === 2024)!.source).toBe('log')
    expect(out.seasons.find(s => s.seasonStartYear === 2021)!.source).toBe('career')
    expect(out.totals.goals).toBe(1 + 6)               // 20 from the dropped season never counts
  })
})

describe('buildPublicPerformance — headline', () => {
  it('current-season headline is competitive-only', () => {
    const currentYear = new Date().getUTCMonth() >= 6
      ? new Date().getUTCFullYear()
      : new Date().getUTCFullYear() - 1
    const out = buildPublicPerformance({
      visible: true,
      matches: [
        match({ match_date: `${currentYear}-08-05`, competition_type: 'league', goals: 1 }),
        match({ match_date: `${currentYear}-08-01`, competition_type: 'pre_season', goals: 3 }),
      ],
      career: [],
    }, 'ST')
    expect(out.currentSeason).not.toBeNull()
    expect(out.currentSeason!.summary.apps).toBe(1)     // pre-season excluded from headline
    expect(out.currentSeason!.summary.goals).toBe(1)
  })
})
