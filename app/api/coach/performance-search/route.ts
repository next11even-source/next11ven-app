import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { buildPublicPerformance, toPublicMatches, type PublicCareerRow } from '@/lib/publicStats'
import { performanceTrackerEnabled } from '@/lib/performance'

export const runtime = 'nodejs'

// Coach recruitment dashboard — facts-only, sortable/filterable performance for
// players who have consented TWICE: actively_looking (open to recruitment) AND
// performance_stats_public (stats shown). Reuses buildPublicPerformance, so the
// numbers are the same allowlisted aggregate as the public profile — notes,
// tags and self-ratings never reach a coach. No percentiles, alerts or
// verification; the coach reads raw facts and concludes for themselves.
//
// Coach Pro feature: non-premium coaches get { locked: true } and an upsell.

type SortKey = 'involvements' | 'goals' | 'assists' | 'apps' | 'minutes' | 'per90Goals' | 'perGameInvolvements'
const SORT_KEYS: SortKey[] = ['involvements', 'goals', 'assists', 'apps', 'minutes', 'per90Goals', 'perGameInvolvements']

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
  const minApps = parseInt(params.get('minApps') ?? '0', 10) || 0
  const sortRaw = params.get('sort') as SortKey | null
  const sort: SortKey = sortRaw && SORT_KEYS.includes(sortRaw) ? sortRaw : 'involvements'

  const service = serviceSupabase()

  // Consent gate: open to recruitment AND stats shown.
  const { data: players, error: pErr } = await service
    .from('profiles')
    .select('id, full_name, avatar_url, position, secondary_position, playing_level, contract_status, city')
    .in('role', ['player', 'admin'])
    .eq('approved', true)
    .eq('actively_looking', true)
    .eq('performance_stats_public', true)

  if (pErr) return NextResponse.json({ error: 'Failed to load players' }, { status: 500 })

  const ids = (players ?? []).map(p => p.id)
  if (ids.length === 0) return NextResponse.json({ locked: false, players: [] })

  const [{ data: matchRows }, { data: careerRows }] = await Promise.all([
    service.from('performance_matches').select('*, club_stints(club_name, level)').in('player_id', ids).order('match_date', { ascending: false }),
    service.from('career_stats').select('*').in('player_id', ids),
  ])

  // Group by player.
  const matchesByPlayer = new Map<string, Record<string, unknown>[]>()
  for (const m of matchRows ?? []) {
    const arr = matchesByPlayer.get(m.player_id as string) ?? []
    arr.push(m)
    matchesByPlayer.set(m.player_id as string, arr)
  }
  const careerByPlayer = new Map<string, PublicCareerRow[]>()
  for (const c of (careerRows ?? []) as (PublicCareerRow & { player_id: string })[]) {
    const arr = careerByPlayer.get(c.player_id) ?? []
    arr.push(c)
    careerByPlayer.set(c.player_id, arr)
  }

  const rows = (players ?? []).map(p => {
    const perf = buildPublicPerformance(
      { visible: true, matches: toPublicMatches(matchesByPlayer.get(p.id) ?? []), career: careerByPlayer.get(p.id) ?? [] },
      p.position,
    )
    const cs = perf.currentSeason?.summary ?? null
    const cd = perf.currentDetail
    return {
      id: p.id,
      full_name: p.full_name,
      avatar_url: p.avatar_url,
      position: p.position,
      secondary_position: p.secondary_position,
      level: perf.level ?? p.playing_level ?? null,
      contract_status: p.contract_status,
      city: p.city,
      versatility: perf.versatility,
      current: cs ? {
        apps: cs.apps, goals: cs.goals, assists: cs.assists, involvements: cs.involvements,
        minutes: cs.minutes, avgMinutes: cs.avgMinutes, cleanSheets: cs.cleanSheets, motm: cs.motmCount,
      } : null,
      rates: cd ? { per90Goals: cd.rates.per90Goals, per90Involvements: cd.rates.per90Involvements, perGameInvolvements: cd.rates.perGameInvolvements } : null,
      form: cd?.form.results ?? [],
      discipline: cd?.discipline ?? { yellowCards: 0, redCards: 0 },
      career: { apps: perf.totals.apps, goals: perf.totals.goals, assists: perf.totals.assists },
      hasData: perf.hasAny,
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
  if (minApps > 0) filtered = filtered.filter(r => (r.current?.apps ?? 0) >= minApps)

  // Sort — current-season metric; career-only players fall to 0 for these keys.
  const metric = (r: typeof rows[number]): number => {
    switch (sort) {
      case 'goals': return r.current?.goals ?? 0
      case 'assists': return r.current?.assists ?? 0
      case 'apps': return r.current?.apps ?? 0
      case 'minutes': return r.current?.minutes ?? 0
      case 'per90Goals': return r.rates?.per90Goals ?? 0
      case 'perGameInvolvements': return r.rates?.perGameInvolvements ?? 0
      default: return r.current?.involvements ?? 0
    }
  }
  filtered.sort((a, b) => metric(b) - metric(a))

  return NextResponse.json({ locked: false, players: filtered })
}
