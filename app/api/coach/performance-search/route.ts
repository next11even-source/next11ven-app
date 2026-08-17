import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { buildPublicPerformance, toPublicMatches, RATE_MIN_MINUTES, type PublicCareerRow } from '@/lib/publicStats'
import { performanceTrackerEnabled } from '@/lib/performance'
import { HIDDEN_PROFILE_FILTER } from '@/lib/hiddenProfiles'
import { trackerLevelRank, TRACKER_LEVELS } from '@/lib/levels'

export const runtime = 'nodejs'

// Coach recruitment dashboard — facts-only, sortable/filterable performance.
// Reuses buildPublicPerformance, so the numbers are the same allowlisted
// aggregate as the public profile: notes, tags and self-ratings never reach a
// coach. No percentiles, alerts or verification; the coach reads raw facts and
// concludes for themselves.
//
// VISIBILITY: gated on performance_stats_public (the player's consent switch),
// NOT on actively_looking. actively_looking is premium-only and opt-in, which
// throttled this dashboard to ~21 players against ~134 who actually have stats —
// a paid product ranking an almost-empty list. Availability is now a returned
// signal + optional `available=1` filter, not a wall. No new exposure: these
// players are already browsable at /dashboard/{player,coach}/players, and the
// figures are the same ones public_player_performance() already serves on their
// profile page to any logged-in user.
//
// Coach Pro feature: non-premium coaches get { locked: true } plus a dynamic
// preview — up to 2 real players with pedigree (stepsAbove > 0), preferring
// ones near the coach (coarse city text match, same weak-signal approach as
// lib/recommendations.ts) and backfilling with the next-best pedigree players
// elsewhere if the local pool can't fill 2. The teaser must never render
// empty while ANY qualifying player exists — but a backfilled (non-local)
// card is marked `nearby: false` so the client's "+X near you" copy never
// claims a player is local when they aren't. remainingNearby / remainingCount
// are both real counts against the qualifying pool — never fabricated.

// Current-season figures are withheld from the coach dashboard for now. One
// player has logged games this season, so the live view is "2 apps · 15 avg
// min" — that isn't a recruitment signal, it's an advert for an empty feature.
// Career history (self-reported, split by level) plus pedigree is the honest
// body of work while match logging is still the constraint. Flip this to true
// once enough players log games for the season view to stand up; the season
// code paths below stay intact so it's a one-line change.
const SEASON_STATS_VISIBLE = false

// Ranks on AVERAGE minutes, never total. Sorting a recruitment search by total
// minutes ranks whoever has the longest history, not whoever plays the most
// football — an 11-season veteran buries a teenager playing every minute.
// Average answers the question a coach is actually asking: does he finish games?
type SortKey = 'pedigreeScore' | 'involvements' | 'goals' | 'assists' | 'apps' | 'avgMinutes' | 'per90Goals' | 'perGameInvolvements'
const SORT_KEYS: SortKey[] = ['pedigreeScore', 'involvements', 'goals', 'assists', 'apps', 'avgMinutes', 'per90Goals', 'perGameInvolvements']

const round2 = (n: number) => Math.round(n * 100) / 100

// Default sort: "best players on the app" outranks "most prolific at any
// level". Plain goal involvements let a Sunday-league top scorer outrank a
// player doing real work three steps higher — pedigreeScore folds level
// difficulty in so it doesn't. Filters (available, position, level) still
// apply on top, same as every other sort.
//
// Goals count 3x an assist — solves for the case a scorer should never lose
// to a creator on raw combined total (10G/2A must outrank 5G/15A at the same
// level: 10*3+2=32 > 5*3+15=30; 1 goal ≈ 3 assists at the margin).
const PEDIGREE_GOAL_WEIGHT = 3
const PEDIGREE_ASSIST_WEIGHT = 1

// Each rank down TRACKER_LEVELS is worth 65% of the one above — level is the
// dominant factor (10 goals at Step 4 outweighs 20 at Step 7/Other) without
// zeroing out lower-level output entirely. Unranked/off-list levels weight
// the same as the ladder's last rung (Other), never higher.
//
// Started at 0.75; raised to 0.65 (16 Aug 2026) after a real ordering showed
// the problem it's meant to solve: a 119-app Step 7 career (61G/6A) out-scored
// a 60-app Step 5 career (30G/10A) despite two levels of gap, because 0.75
// wasn't steep enough to stop a much longer low-level sample from catching up
// to a shorter higher-level one. At 0.65 the Step 5 career clears the Step 7
// one with a real margin, and a Step 2 career that had been buried near the
// bottom of a mixed list moves to the top.
const PEDIGREE_LEVEL_DECAY = 0.65
function levelPedigreeWeight(level: string | null | undefined): number {
  const rank = trackerLevelRank(level) ?? (TRACKER_LEVELS.length - 1)
  return Math.pow(PEDIGREE_LEVEL_DECAY, rank)
}

// Summed across every level a player has logged career output at — a career
// body of work, not a single-season rate. Uses careerByLevel (already split
// per level for the honest-framing rule below), never the blended totals.
function pedigreeScoreFrom(careerByLevel: { level: string | null; goals: number; assists: number }[]): number {
  return round2(careerByLevel.reduce((sum, lvl) =>
    sum + levelPedigreeWeight(lvl.level) * (lvl.goals * PEDIGREE_GOAL_WEIGHT + lvl.assists * PEDIGREE_ASSIST_WEIGHT), 0))
}

// Which body of work the sort ranks on. 'career' is the default because
// pre-platform history is where the data currently is — ranking on
// current-season only made every career-history player score 0 on every key, so
// the sort was a no-op and the list came back in arbitrary order.
type Scope = 'career' | 'season'

type Metrics = {
  apps: number
  goals: number
  assists: number
  involvements: number
  minutes: number
  avgMinutes: number | null
  per90Goals: number | null
  perGameInvolvements: number | null
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

function metricsFrom(apps: number, goals: number, assists: number, minutes: number): Metrics {
  return {
    apps, goals, assists, involvements: goals + assists, minutes,
    avgMinutes: apps > 0 && minutes > 0 ? Math.round(minutes / apps) : null,
    // Withheld below the sample floor — see RATE_MIN_MINUTES. A player two sub
    // appearances in must not be ranked on a rate computed off 30 minutes.
    per90Goals: minutes >= RATE_MIN_MINUTES ? round2((goals / minutes) * 90) : null,
    perGameInvolvements: apps > 0 ? round2((goals + assists) / apps) : null,
  }
}

function serviceSupabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
async function authSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
}

export async function GET(req: NextRequest) {
  if (!performanceTrackerEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = await authSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: me } = await supabase.from('profiles').select('role, premium, city').eq('id', user.id).single()
  if (!me || (me.role !== 'coach' && me.role !== 'admin')) {
    return NextResponse.json({ error: 'Coach account required' }, { status: 403 })
  }
  // Coach Pro gate — recruitment intelligence is the paid coach layer. Locked
  // coaches still fall through to the data build below so the preview (top 2
  // by pedigree, location-aware) can be computed from real rows, not a
  // second query path.
  const isLocked = !me.premium && me.role !== 'admin'
  const coachCity = norm(me.city)

  const params = req.nextUrl.searchParams
  const positionFilter = params.get('position')
  const levelFilter = params.get('level')
  const availableOnly = params.get('available') === '1'
  const minApps = parseInt(params.get('minApps') ?? '0', 10) || 0
  const sortRaw = params.get('sort') as SortKey | null
  const sort: SortKey = sortRaw && SORT_KEYS.includes(sortRaw) ? sortRaw : 'pedigreeScore'
  const scope: Scope = SEASON_STATS_VISIBLE && params.get('scope') === 'season' ? 'season' : 'career'

  const service = serviceSupabase()

  // Data-first: pull the stat rows, derive the player set from them, then load
  // only those profiles. This IS the "has any data" gate, and it keeps the
  // profile lookup to roughly the number of players who actually track, instead
  // of sending every approved player's UUID through an .in() filter.
  // TODO: both reads are unbounded. Fine at current volume (tens of rows);
  // move to a season-scoped window once match logging scales.
  const [{ data: matchRows }, { data: careerRows }] = await Promise.all([
    service.from('performance_matches').select('*, club_stints(club_name, level)').order('match_date', { ascending: false }),
    service.from('career_stats').select('*'),
  ])

  const dataIds = [...new Set([
    ...(matchRows ?? []).map(m => m.player_id as string),
    ...(careerRows ?? []).map(c => c.player_id as string),
  ])]
  if (dataIds.length === 0) {
    return NextResponse.json(isLocked
      ? { locked: true, preview: [], remainingNearby: 0, remainingCount: 0, players: [] }
      : { locked: false, scope, seasonStatsVisible: SEASON_STATS_VISIBLE, players: [] })
  }

  // Consent + eligibility gate.
  const { data: players, error: pErr } = await service
    .from('profiles')
    .select('id, full_name, avatar_url, position, secondary_position, playing_level, city, actively_looking')
    .in('id', dataIds)
    .in('role', ['player', 'admin'])
    .eq('approved', true)
    .eq('performance_stats_public', true)
    .not('id', 'in', HIDDEN_PROFILE_FILTER)

  if (pErr) return NextResponse.json({ error: 'Failed to load players' }, { status: 500 })
  if (!players || players.length === 0) {
    return NextResponse.json(isLocked
      ? { locked: true, preview: [], remainingNearby: 0, remainingCount: 0, players: [] }
      : { locked: false, scope, seasonStatsVisible: SEASON_STATS_VISIBLE, players: [] })
  }

  const allowed = new Set(players.map(p => p.id))

  // Group by player — consented players only, so a non-consenting player's rows
  // are dropped before they can reach the aggregate.
  const matchesByPlayer = new Map<string, Record<string, unknown>[]>()
  for (const m of matchRows ?? []) {
    const pid = m.player_id as string
    if (!allowed.has(pid)) continue
    const arr = matchesByPlayer.get(pid) ?? []
    arr.push(m)
    matchesByPlayer.set(pid, arr)
  }
  const careerByPlayer = new Map<string, PublicCareerRow[]>()
  for (const c of (careerRows ?? []) as (PublicCareerRow & { player_id: string })[]) {
    if (!allowed.has(c.player_id)) continue
    const arr = careerByPlayer.get(c.player_id) ?? []
    arr.push(c)
    careerByPlayer.set(c.player_id, arr)
  }

  const rows = players.map(p => {
    const perf = buildPublicPerformance(
      { visible: true, matches: toPublicMatches(matchesByPlayer.get(p.id) ?? []), career: careerByPlayer.get(p.id) ?? [] },
      p.position,
    )
    const cs = perf.currentSeason?.summary ?? null
    const cd = perf.currentDetail
    const level = perf.level ?? p.playing_level ?? null

    // Pedigree: peak level reached vs. where they play now. The unfakeable
    // signal — a player who's been several steps above his current club.
    const peakRank = trackerLevelRank(perf.pedigree.peakLevel)
    const currentRank = trackerLevelRank(p.playing_level ?? perf.level)
    const stepsAbove = peakRank != null && currentRank != null && currentRank > peakRank
      ? currentRank - peakRank
      : 0

    return {
      id: p.id,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      position: p.position,
      secondary_position: p.secondary_position,
      level,
      city: p.city,
      actively_looking: !!p.actively_looking,
      versatility: perf.versatility,
      pedigree: {
        peakLevel: perf.pedigree.peakLevel,
        academyBackground: perf.pedigree.academyBackground,
        stepsAbove,
      },
      // Season-derived fields — withheld from the payload entirely (not just
      // hidden client-side) while SEASON_STATS_VISIBLE is off.
      current: SEASON_STATS_VISIBLE && cs ? {
        apps: cs.apps, goals: cs.goals, assists: cs.assists, involvements: cs.involvements,
        minutes: cs.minutes, avgMinutes: cs.avgMinutes, cleanSheets: cs.cleanSheets, motm: cs.motmCount,
      } : null,
      rates: SEASON_STATS_VISIBLE && cd ? { per90Goals: cd.rates.per90Goals, per90Involvements: cd.rates.per90Involvements, perGameInvolvements: cd.rates.perGameInvolvements } : null,
      form: SEASON_STATS_VISIBLE ? cd?.form.results ?? [] : [],
      discipline: SEASON_STATS_VISIBLE ? cd?.discipline ?? { yellowCards: 0, redCards: 0 } : { yellowCards: 0, redCards: 0 },
      career: { apps: perf.totals.apps, goals: perf.totals.goals, assists: perf.totals.assists, minutes: perf.totals.minutes },
      // Career output split by level — the card renders THIS, never the blended
      // career line, so academy output is never read as senior output.
      careerByLevel: perf.careerByLevel,
      hasData: perf.hasAny,
      _metrics: {
        career: metricsFrom(perf.totals.apps, perf.totals.goals, perf.totals.assists, perf.totals.minutes),
        season: cs ? metricsFrom(cs.apps, cs.goals, cs.assists, cs.minutes) : null,
        // Career-wide by construction — not scope-dependent like the metrics
        // above, since it's already summed across every level a player has
        // logged. See pedigreeScoreFrom.
        pedigreeScore: pedigreeScoreFrom(perf.careerByLevel),
      },
    }
  })
  .filter(r => r.hasData)

  // Locked coaches never reach filters/sort/full list — they get a dynamic,
  // real, location-aware preview instead. Local pedigree players (coarse city
  // text match against the coach's own city, same weak-signal approach as
  // lib/recommendations.ts) fill the 2 slots first; if the local pool can't
  // fill both, the next-best pedigree players elsewhere backfill the rest —
  // the teaser must never render empty while any qualifying player exists.
  // Backfilled cards are marked `nearby: false` so the client never claims a
  // player is local when they aren't. Both counts are real against the
  // qualifying pool (stepsAbove > 0) — never fabricated.
  if (isLocked) {
    const qualifying = rows
      .filter(r => r.pedigree.stepsAbove > 0)
      .sort((a, b) => b.pedigree.stepsAbove - a.pedigree.stepsAbove)

    const local = coachCity ? qualifying.filter(r => {
      const pc = norm(r.city)
      return !!pc && (pc.includes(coachCity) || coachCity.includes(pc))
    }) : []
    const localIds = new Set(local.map(r => r.id))
    const rest = qualifying.filter(r => !localIds.has(r.id))

    const previewRows = local.slice(0, 2)
    if (previewRows.length < 2) previewRows.push(...rest.slice(0, 2 - previewRows.length))

    const preview = previewRows.map(p => ({
      id: p.id,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      position: p.position,
      secondary_position: p.secondary_position,
      level: p.level,
      city: p.city,
      actively_looking: p.actively_looking,
      pedigree: p.pedigree,
      career: { apps: p.career.apps, goals: p.career.goals, assists: p.career.assists },
      nearby: localIds.has(p.id),
    }))
    const shownLocal = preview.filter(p => p.nearby).length
    const remainingNearby = Math.max(0, local.length - shownLocal)
    const remainingCount = Math.max(0, qualifying.length - preview.length)
    return NextResponse.json({ locked: true, preview, remainingNearby, remainingCount, players: [] })
  }

  // Filters.
  let filtered = rows
  if (positionFilter) {
    filtered = filtered.filter(r =>
      r.position === positionFilter || r.secondary_position === positionFilter || r.versatility.includes(positionFilter))
  }
  if (levelFilter) filtered = filtered.filter(r => r.level === levelFilter)
  if (availableOnly) filtered = filtered.filter(r => r.actively_looking)
  if (minApps > 0) {
    filtered = filtered.filter(r => ((scope === 'season' ? r._metrics.season?.apps : r._metrics.career.apps) ?? 0) >= minApps)
  }

  // Sort within the selected scope. Players with nothing in that scope score 0
  // and fall to the bottom, rather than every player tying at 0.
  const metric = (r: typeof rows[number]): number => {
    // pedigreeScore is career-wide regardless of scope — see _metrics above.
    if (sort === 'pedigreeScore') return r._metrics.pedigreeScore
    const m = scope === 'season' ? r._metrics.season : r._metrics.career
    if (!m) return 0
    switch (sort) {
      case 'goals': return m.goals
      case 'assists': return m.assists
      case 'apps': return m.apps
      case 'avgMinutes': return m.avgMinutes ?? 0
      case 'per90Goals': return m.per90Goals ?? 0
      case 'perGameInvolvements': return m.perGameInvolvements ?? 0
      default: return m.involvements
    }
  }
  filtered.sort((a, b) => metric(b) - metric(a))

  // _metrics is a sort helper, not part of the payload contract.
  const payload = filtered.map(({ _metrics, hasData, ...rest }) => { void _metrics; void hasData; return rest })

  return NextResponse.json({ locked: false, scope, seasonStatsVisible: SEASON_STATS_VISIBLE, players: payload })
}
