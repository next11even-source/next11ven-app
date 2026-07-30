import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { buildWeeklyDigest, type DigestPlatform, type DigestCoachView } from '@/lib/weeklyDigest'
import { sendWeeklyDigestEmail } from '@/lib/email'
import { positionCategory, POSITION_CATEGORIES } from '@/lib/positions'
import { reportError } from '@/lib/alert'

export const runtime = 'nodejs'
// Emails the full approved-player base — sequential awaits would blow past the
// old 60s cap and time out mid-send. 300s + bounded concurrency keeps one clean
// pass well inside the limit.
export const maxDuration = 300

// Sent in parallel batches of this size. Kept low to stay under Resend's
// ~10 req/s rate limit (peak ≈ CONCURRENCY / avg-latency).
const CONCURRENCY = 4

const SITE = process.env.APP_URL ?? 'https://app.next11ven.com'

type ViewerEmbed = { role: string | null; full_name: string | null; club: string | null }
type ViewRow = { player_id: string; viewer_id: string; viewer: ViewerEmbed | ViewerEmbed[] | null }

type PlayerRow = {
  id: string
  email: string | null
  full_name: string | null
  premium: boolean | null
  position: string | null
  email_marketing_opt_out: boolean | null
  is_active: boolean | null
  password_set_at: string | null
  // completion fields
  avatar_url: string | null
  club: string | null
  city: string | null
  status: string | null
  phone: string | null
  date_of_birth: string | null
  foot: string | null
  height: string | null
  playing_level: string | null
  highlight_urls: string[] | null
  goals: number | null
  assists: number | null
  appearances: number | null
}

function resolveViewer(raw: ViewerEmbed | ViewerEmbed[] | null): ViewerEmbed | null {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Optional targeting for safe test sends: ?to=<email> restricts the send to a
  // single recipient. ?dryRun=1 computes + renders but sends nothing.
  const onlyTo = req.nextUrl.searchParams.get('to')?.toLowerCase() || null
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // ── Platform aggregates (computed once, shared by every email) ──────────────
  const [newOppsRes, coachIdsRes, activeOppsRes] = await Promise.all([
    supabase
      .from('opportunities')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .gte('created_at', sevenDaysAgo),
    supabase.from('profiles').select('id').eq('role', 'coach').eq('approved', true),
    supabase.from('opportunities').select('position').eq('is_active', true).limit(2000),
  ])

  if (newOppsRes.error || coachIdsRes.error || activeOppsRes.error) {
    const err = newOppsRes.error || coachIdsRes.error || activeOppsRes.error
    console.error('[weekly-digest] aggregate query error:', err)
    reportError('/api/cron/weekly-digest', err, 'failed platform aggregate query')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  // Coaches "active this month" = signed in within 30 days. last_active only
  // updates on profile edits (undercounts), so use auth's last_sign_in_at.
  // Degrades gracefully: on error the count stays 0 and the line is omitted.
  const coachIds = new Set((coachIdsRes.data ?? []).map(c => (c as { id: string }).id))
  let activeCoachesMonth = 0
  try {
    for (let page = 1; ; page++) {
      const { data: au, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
      if (error || !au?.users?.length) break
      for (const u of au.users) {
        if (u.last_sign_in_at && coachIds.has(u.id) && new Date(u.last_sign_in_at).toISOString() >= thirtyDaysAgo) {
          activeCoachesMonth++
        }
      }
      if (au.users.length < 1000) break
    }
  } catch (e) {
    console.error('[weekly-digest] listUsers failed for active-coaches count:', e)
  }

  const oppsByCategory: Record<string, number> = {}
  for (const o of activeOppsRes.data ?? []) {
    const pos = (o as { position: string | null }).position
    const cat = positionCategory(pos)
    if (cat) {
      oppsByCategory[cat] = (oppsByCategory[cat] ?? 0) + 1
    } else if (!pos || !pos.trim()) {
      // "Any position" role (position stored null/blank) is open to everyone —
      // count it toward every category so it triggers "Roles for you" for all.
      for (const c of POSITION_CATEGORIES) oppsByCategory[c] = (oppsByCategory[c] ?? 0) + 1
    }
    // else: a non-null but unmapped position — skip (shouldn't happen via the form)
  }

  const platform: DigestPlatform = {
    newOpps: newOppsRes.count ?? 0,
    activeCoachesMonth,
    oppsByCategory,
  }

  // ── Coach views this week → player_id -> deduped coach viewers ──────────────
  const { data: views, error: viewsError } = await supabase
    .from('player_views')
    .select('player_id, viewer_id, viewer:viewer_id(role, full_name, club)')
    .gte('viewed_at', sevenDaysAgo)
    .limit(5000)

  if (viewsError) {
    console.error('[weekly-digest] views query error:', viewsError)
    reportError('/api/cron/weekly-digest', viewsError, 'failed to query player_views')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const coachViewMap = new Map<string, Map<string, DigestCoachView>>()
  for (const row of (views ?? []) as unknown as ViewRow[]) {
    const viewer = resolveViewer(row.viewer)
    if (!viewer || viewer.role !== 'coach') continue
    if (!coachViewMap.has(row.player_id)) coachViewMap.set(row.player_id, new Map())
    const inner = coachViewMap.get(row.player_id)!
    if (!inner.has(row.viewer_id)) {
      inner.set(row.viewer_id, { full_name: viewer.full_name ?? null, club: viewer.club ?? null })
    }
  }

  // ── Eligible players (approved players/admins) ──────────────────────────────
  const { data: players, error: playersError } = await supabase
    .from('profiles')
    .select(
      'id, email, full_name, premium, position, email_marketing_opt_out, is_active, password_set_at, avatar_url, club, city, status, phone, date_of_birth, foot, height, playing_level, highlight_urls, goals, assists, appearances'
    )
    .in('role', ['player', 'admin'])
    .eq('approved', true)
    .limit(5000)

  if (playersError) {
    console.error('[weekly-digest] profiles query error:', playersError)
    reportError('/api/cron/weekly-digest', playersError, 'failed to query profiles')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  const all = (players ?? []) as PlayerRow[]
  const eligible = all.filter(
    p =>
      p.email &&
      !p.email_marketing_opt_out &&
      p.is_active !== false &&
      (!onlyTo || p.email.toLowerCase() === onlyTo)
  )

  let sent = 0
  let skipped = all.length - eligible.length
  let failed = 0

  async function sendToPlayer(p: PlayerRow) {
    const coachViews = Array.from(coachViewMap.get(p.id)?.values() ?? [])
    try {
      const { subject, contentHtml } = buildWeeklyDigest({
        site: SITE,
        platform,
        coachViews,
        unclaimed: p.password_set_at == null,
        player: {
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          premium: !!p.premium,
          position: p.position,
          avatar_url: p.avatar_url,
          club: p.club,
          city: p.city,
          status: p.status,
          phone: p.phone,
          date_of_birth: p.date_of_birth,
          foot: p.foot,
          height: p.height,
          playing_level: p.playing_level,
          highlight_urls: p.highlight_urls,
          goals: p.goals ?? 0,
          assists: p.assists ?? 0,
          appearances: p.appearances ?? 0,
        },
      })

      if (dryRun) {
        sent++
        return
      }

      await sendWeeklyDigestEmail({ to: p.email!, playerId: p.id, subject, contentHtml })
      sent++
    } catch (err) {
      // A thrown assertClean (or send failure) skips this player — never mails garbage.
      console.error(`[weekly-digest] failed for player ${p.id}:`, err)
      reportError('/api/cron/weekly-digest', err, `digest failed for player ${p.id}`)
      failed++
    }
  }

  // Bounded-concurrency batches — fast enough to finish in one pass, gentle
  // enough on Resend's rate limit.
  for (let i = 0; i < eligible.length; i += CONCURRENCY) {
    await Promise.all(eligible.slice(i, i + CONCURRENCY).map(sendToPlayer))
  }

  console.log(`[weekly-digest] done — sent:${sent} skipped:${skipped} failed:${failed} dryRun:${dryRun}`)
  return NextResponse.json({ sent, skipped, failed, dryRun, platform })
}
