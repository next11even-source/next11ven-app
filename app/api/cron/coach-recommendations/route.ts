import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getRecommendedPlayers, logRecommendations } from '@/lib/recommendations'
import { sendCoachRecommendationsEmail } from '@/lib/email'
import { reportError } from '@/lib/alert'

export const runtime = 'nodejs'
export const maxDuration = 60

const EMAIL_RECOMMENDATION_COUNT = 3

// Weekly coach recommendations digest — Tuesday 08:00 UTC (vercel.json).
// Respects email_marketing_opt_out, and every send carries a
// "stop these weekly player tips" link (same unsubscribe endpoint).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: coaches, error: coachesError } = await supabase
    .from('profiles')
    .select('id, email, full_name, email_marketing_opt_out')
    .eq('role', 'coach')
    .eq('approved', true)
    .not('email', 'is', null)

  if (coachesError) {
    console.error('[coach-recommendations] coaches query error:', coachesError)
    reportError('/api/cron/coach-recommendations', coachesError, 'failed to query coaches')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  if (!coaches || coaches.length === 0) {
    return NextResponse.json({ sent: 0, skipped: 0, failed: 0, reason: 'no active coaches' })
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const coach of coaches) {
    if (coach.email_marketing_opt_out) {
      skipped++
      continue
    }
    try {
      const { players, hasSearchHistory } = await getRecommendedPlayers(
        supabase,
        coach.id,
        'email',
        EMAIL_RECOMMENDATION_COUNT
      )

      if (players.length === 0) {
        skipped++
        continue
      }

      await sendCoachRecommendationsEmail({
        to: coach.email!,
        coachId: coach.id,
        coachName: coach.full_name,
        players,
        personalised: hasSearchHistory,
      })

      await logRecommendations(supabase, coach.id, players.map(p => p.id), 'email')

      sent++
      console.log(`[coach-recommendations] sent ${players.length} picks to ${coach.email}`)
    } catch (err) {
      console.error(`[coach-recommendations] failed for coach ${coach.id}:`, err)
      reportError('/api/cron/coach-recommendations', err, `failed for coach ${coach.id}`)
      failed++
    }
  }

  console.log(`[coach-recommendations] done — sent:${sent} skipped:${skipped} failed:${failed}`)
  return NextResponse.json({ sent, skipped, failed })
}
