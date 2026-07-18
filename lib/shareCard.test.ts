import { describe, it, expect } from 'vitest'
import { buildPublicPerformance, type PublicMatch, type PublicCareerRow } from './publicStats'
import { renderShareCard } from './shareCard'

function m(over: Partial<PublicMatch> & { match_date: string }): PublicMatch {
  return {
    competition_type: 'league',
    goals_for: 2, goals_against: 0, started: true, position: 'ST', minutes_played: 90,
    goals: 0, assists: 0, penalty_saves: 0, yellow_cards: 0, red_card: false,
    club_name: 'Test FC', club_level: 'Step 4', man_of_the_match: false, ...over,
  }
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

// Renders the real card (satori + resvg). loadBarlow falls back to the default
// font if the font fetch fails, so this passes offline too. The point is to
// catch satori layout errors (every multi-child box needs display:flex), which
// the type-checker can't see.
describe('renderShareCard', () => {
  it('renders a valid PNG for an attacking current season', async () => {
    const perf = buildPublicPerformance({
      visible: true,
      matches: [
        m({ match_date: '2026-09-10', goals: 2, assists: 1, minutes_played: 90, goals_for: 3, goals_against: 1 }),
        m({ match_date: '2026-09-03', goals: 1, assists: 0, minutes_played: 90, goals_for: 2, goals_against: 2 }),
        m({ match_date: '2026-08-27', goals: 0, assists: 1, minutes_played: 70, goals_for: 1, goals_against: 0 }),
      ],
      career: [],
    }, 'ST')
    const res = await renderShareCard(perf, { name: 'Test Player', position: 'ST' })
    const buf = new Uint8Array(await res.arrayBuffer())
    expect(buf.length).toBeGreaterThan(2000)
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual(PNG_MAGIC)
  }, 30000)

  it('renders for a defensive career-only player (no current season)', async () => {
    const career: PublicCareerRow[] = [{
      season_start_year: 2015, club_name: 'Old FC', level: 'Step 4', position: 'CB',
      apps: 30, goals: 2, assists: 1, minutes: 2700, clean_sheets: 12, source: 'self_reported',
    }]
    const perf = buildPublicPerformance({ visible: true, matches: [], career }, 'CB')
    const res = await renderShareCard(perf, { name: null, position: null })
    const buf = new Uint8Array(await res.arrayBuffer())
    expect([buf[0], buf[1], buf[2], buf[3]]).toEqual(PNG_MAGIC)
  }, 30000)
})
