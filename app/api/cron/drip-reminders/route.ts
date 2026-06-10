import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  sendDripDay3Email,
  sendDripDay7Email,
  sendPaymentFailedFollowUpEmail,
  sendSubscriptionCancelledWinBackEmail,
} from '@/lib/email'
import { reportError } from '@/lib/alert'

export const runtime = 'nodejs'
export const maxDuration = 60

type ProfileEmbed = {
  email: string | null
  full_name: string | null
  phone: string | null
  sms_opt_in: boolean | null
  premium: boolean
  last_sms_at: string | null
  email_marketing_opt_out: boolean | null
}

type MessageEmbed = {
  read_at: string | null
}

type DripJob = {
  id: string
  recipient_id: string
  message_id: string | null
  sequence_step: number
  send_at: string
  profiles: ProfileEmbed | ProfileEmbed[] | null
  messages: MessageEmbed | MessageEmbed[] | null
}

function resolveProfile(raw: ProfileEmbed | ProfileEmbed[] | null): ProfileEmbed | null {
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: jobs, error } = await supabase
    .from('drip_jobs')
    .select('id, recipient_id, message_id, sequence_step, send_at, profiles(email, full_name, phone, sms_opt_in, premium, last_sms_at, email_marketing_opt_out), messages(read_at)')
    .eq('sent', false)
    .lte('send_at', new Date().toISOString())
    .limit(100)

  if (error) {
    console.error('[Drip cron] query error:', error)
    reportError('/api/cron/drip-reminders', error, 'failed to query drip_jobs')
    return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const job of jobs as unknown as DripJob[]) {
    const profile = resolveProfile(job.profiles)

    if (!profile) {
      await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
      skipped++
      continue
    }

    // ── Transactional billing steps — bypass marketing opt-out ─────────────────
    // step 99: payment failed 48h follow-up
    // step 98: subscription cancelled win-back (3 days)
    if (job.sequence_step === 99 || job.sequence_step === 98) {
      // Skip only if they've re-subscribed since the job was queued
      if (profile.premium === true) {
        await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
        skipped++
        continue
      }

      if (job.sequence_step === 99) {
        try {
          if (profile.email) {
            await sendPaymentFailedFollowUpEmail({ to: profile.email, toName: profile.full_name })
          }
          await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
          processed++
        } catch (err) {
          console.error(`[Drip cron] job ${job.id} step 99 failed:`, err)
          reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step 99 failed`)
          failed++
        }
      } else {
        // step 98 — win-back
        try {
          let opportunityCount: number | undefined
          const { count, error: oppError } = await supabase
            .from('opportunities')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
          if (!oppError && count !== null) {
            opportunityCount = count
          }

          if (profile.email) {
            await sendSubscriptionCancelledWinBackEmail({
              to: profile.email,
              toName: profile.full_name,
              opportunityCount,
            })
          }
          await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
          processed++
        } catch (err) {
          console.error(`[Drip cron] job ${job.id} step 98 failed:`, err)
          reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step 98 failed`)
          failed++
        }
      }
      continue
    }

    // ── Marketing drip steps 2 and 3 ────────────────────────────────────────────

    // Stop sequence if player has already upgraded
    if (profile.premium === true) {
      await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
      skipped++
      continue
    }

    // Stop sequence if player has opted out of marketing emails
    if (profile.email_marketing_opt_out === true) {
      await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
      skipped++
      continue
    }

    // Stop sequence if the triggering message has already been read
    // (player was previously premium, read it, then lapsed — don't prompt them to upgrade for a message they've seen)
    const msgEmbed = job.messages
    const msg = Array.isArray(msgEmbed) ? (msgEmbed[0] ?? null) : msgEmbed
    if (msg?.read_at) {
      await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
      skipped++
      continue
    }

    if (job.sequence_step === 2) {
      // Day 3 — email only
      try {
        if (profile.email) {
          await sendDripDay3Email({ to: profile.email, toName: profile.full_name, playerId: job.recipient_id })
        }
        await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
        processed++
      } catch (err) {
        console.error(`[Drip cron] job ${job.id} step 2 failed:`, err)
        reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step 2 failed`)
        failed++
      }
    } else if (job.sequence_step === 3) {
      // Day 7 — SMS (best-effort) then email (required to mark sent)
      const appUrl = process.env.APP_URL ?? 'https://app.next11ven.com'
      const lastSms = profile.last_sms_at ? new Date(profile.last_sms_at) : null
      const smsAllowed = !lastSms || (Date.now() - lastSms.getTime()) > 86_400_000

      if (
        smsAllowed &&
        process.env.TWILIO_ENABLED !== 'false' &&
        profile.phone &&
        profile.sms_opt_in !== false &&
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
      ) {
        try {
          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
            {
              method: 'POST',
              headers: {
                Authorization: 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                From: process.env.TWILIO_FROM_NUMBER,
                To: profile.phone,
                Body: `NEXT11VEN: A coach messaged you and won't wait forever. The longer this sits, the more likely they've moved on. Upgrade now: ${appUrl}/dashboard/player/premium`,
              }),
            }
          )
          await supabase
            .from('profiles')
            .update({ last_sms_at: new Date().toISOString() })
            .eq('id', job.recipient_id)
        } catch (err) {
          // SMS failure is non-blocking — log but still send the email and mark sent
          reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step 3 SMS failed`)
        }
      }

      try {
        if (profile.email) {
          await sendDripDay7Email({ to: profile.email, toName: profile.full_name, playerId: job.recipient_id })
        }
        await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
        processed++
      } catch (err) {
        console.error(`[Drip cron] job ${job.id} step 3 email failed:`, err)
        reportError('/api/cron/drip-reminders', err, `drip job ${job.id} step 3 email failed`)
        failed++
      }
    } else {
      // Unknown step — mark sent to avoid infinite retry
      await supabase.from('drip_jobs').update({ sent: true }).eq('id', job.id)
      skipped++
    }
  }

  return NextResponse.json({ processed, skipped, failed })
}
