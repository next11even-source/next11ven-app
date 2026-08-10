import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { buildPublicPerformance, toPublicMatches, RATE_MIN_MINUTES, type PublicCareerRow } from '@/lib/publicStats'
import { performanceTrackerEnabled } from '@/lib/performance'
import { HIDDEN_PROFILE_FILTER } from '@/lib/hiddenProfiles'
import { trackerLevelRank } from '@/lib/levels'

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
// Coach Pro feature: non-premium coaches get { locked: true } and an upsell.

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
type SortKey = 'involvements' | 'goals' | 'assists' | 'apps' | 'avgMinutes' | 'per90Goals' | 'perGameInvolvements'
const SORT_KEYS: SortKey[] = ['involvements', 'goals', 'assists', 'apps', 'avgMinutes', 'per90Goals', 'perGameInvolvements']

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

const round2 = (n: number) => Math.round(n * 100) / 100

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

  const { data: me } = await supabase.from('profiles').select('role, premium').eq('id', user.id).single()
  if (!me || (me.role !== 'coach' && me.role !== 'admin')) {
    return NextResponse.json({ error: 'Coach account required' }, { status: 403 })
  }
  // Coach Pro gate — recruitment intelligence is the paid coach layer.
  if (!me.premium && me.role !== 'admin') {
    return NextResponse.json({ locked: true, players: [] })
  }

  const params = req.nextUrl.searchParams
  const positionFilter = params.get('position')
  const levelFilter = params.get('level')
  const availableOnly = params.get('available') === '1'
  const minApps = parseInt(params.get('minApps') ?? '0', 10) || 0
  const sortRaw = params.get('sort') as SortKey | null
  const sort: SortKey = sortRaw && SORT_KEYS.includes(sortRaw) ? sortRaw : 'involvements'
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
  if (dataIds.length === 0) return NextResponse.json({ locked: false, scope, seasonStatsVisible: SEASON_STATS_VISIBLE, players: [] })

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
  if (!players || players.length === 0) return NextResponse.json({ locked: false, scope, seasonStatsVisible: SEASON_STATS_VISIBLE, players: [] })

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
      },
    }
  })
  .filter(r => r.hasData)

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
