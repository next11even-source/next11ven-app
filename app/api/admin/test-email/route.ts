import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  sendSubscriptionCancelledWinBackEmail,
  sendCoachActivationD7Email,
  sendCoachActivationD21Email,
  sendCoachGoneQuietD1Email,
  sendCoachGoneQuietD14Email,
  sendApplicationNudgeEmail,
  sendWeeklyDigestEmail,
  sendBroadcastEmail,
} from '@/lib/email'

const TEMPLATES = [
  'winback',
  'coach_activation_d7',
  'coach_activation_d21',
  'coach_gone_quiet_d1',
  'coach_gone_quiet_d14',
  'application_nudge',
  'weekly_digest',
  'broadcast',
] as const

type Template = typeof TEMPLATES[number]

const Schema = z.object({
  to: z.string().email(),
  template: z.enum(TEMPLATES),
})

const SITE = process.env.APP_URL ?? 'https://app.next11ven.com'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: caller } = await supabase
    .from('profiles')
    .select('role, id')
    .eq('id', user.id)
    .single()

  if (caller?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { to, template } = parsed.data
  const unsubscribeUrl = `${SITE}/api/unsubscribe?id=${user.id}`

  try {
    await sendTemplate(template, to, user.id, unsubscribeUrl)
    return NextResponse.json({ sent: true, to, template })
  } catch (err) {
    console.error('[test-email] send failed:', err)
    return NextResponse.json({ error: 'Send failed' }, { status: 500 })
  }
}

async function sendTemplate(template: Template, to: string, userId: string, unsubscribeUrl: string) {
  switch (template) {
    case 'winback':
      return sendSubscriptionCancelledWinBackEmail({
        to,
        toName: 'Jamal Crawford',
        userId,
        opportunityCount: 14,
        playerPosition: 'Midfielder',
      })

    case 'coach_activation_d7':
      return sendCoachActivationD7Email({
        to,
        coachName: 'Jamal Crawford',
        coachId: userId,
        regionPlayerCount: 34,
        regionLabel: 'Manchester',
      })

    case 'coach_activation_d21':
      return sendCoachActivationD21Email({
        to,
        coachName: 'Jamal Crawford',
        coachId: userId,
        coachesPostedThisWeek: 12,
      })

    case 'coach_gone_quiet_d1':
      return sendCoachGoneQuietD1Email({
        to,
        coachName: 'Jamal Crawford',
        coachId: userId,
        newPlayerCount: 23,
        daysSinceLastPost: 34,
      })

    case 'coach_gone_quiet_d14':
      return sendCoachGoneQuietD14Email({
        to,
        coachName: 'Jamal Crawford',
        coachId: userId,
        coachesPostedThisWeek: 9,
      })

    case 'application_nudge':
      return sendApplicationNudgeEmail({
        to,
        coachName: 'Jamal Crawford',
        total: 5,
        overdue: 2,
        oldestDays: 11,
        atRiskCount: 1,
        atRiskDaysLeft: 3,
      })

    case 'weekly_digest':
      // Weekly digest content is normally built by lib/weeklyDigest.ts per player.
      // Here we send a representative static version so you can verify the template.
      return sendWeeklyDigestEmail({
        to,
        playerId: userId,
        subject: 'Your NEXT11VEN week — test preview',
        contentHtml: `
          <p style="color:#e8dece;margin:0 0 4px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Your week on NEXT11VEN</p>
          <p style="color:#8892aa;margin:0 0 24px;font-size:13px;">Here's a snapshot of your week, Jamal.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0 0 24px;">
            <div style="background:#0d1020;border:1px solid #1e2235;border-radius:10px;padding:16px;text-align:center;">
              <p style="color:#e8dece;font-size:28px;font-weight:700;margin:0 0 4px;">12</p>
              <p style="color:#8892aa;font-size:12px;margin:0;">Profile views this week</p>
            </div>
            <div style="background:#0d1020;border:1px solid #1e2235;border-radius:10px;padding:16px;text-align:center;">
              <p style="color:#e8dece;font-size:28px;font-weight:700;margin:0 0 4px;">8</p>
              <p style="color:#8892aa;font-size:12px;margin:0;">Open roles for you</p>
            </div>
          </div>
          <p style="color:#8892aa;margin:0 0 8px;font-size:13px;line-height:1.6;">24 coaches were active on the platform this month. Don't miss your chance to be seen.</p>
          <a href="${SITE}/dashboard/player/premium" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;margin-top:16px;">Go Pro to be found first</a>
        `,
      })

    case 'broadcast':
      return sendBroadcastEmail({
        to,
        subject: 'Test broadcast — NEXT11VEN',
        contentHtml: `
          <h2 style="color:#e8dece;font-size:20px;font-weight:700;margin:0 0 16px;line-height:1.3;">This is a test broadcast</h2>
          <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">Hi Jamal, this is what a broadcast email looks like when you compose one from the admin panel.</p>
          <p style="color:#8892aa;margin:0 0 28px;line-height:1.6;">The body supports double line breaks as paragraph breaks, and you can use <strong style="color:#e8dece;">{{name}}</strong> to personalise — it resolves to the recipient's first name.</p>
          <a href="${process.env.APP_URL ?? 'https://app.next11ven.com'}/dashboard/admin/broadcast" style="display:block;padding:14px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;text-align:center;">Open Email Composer</a>
        `,
        unsubscribeUrl,
      })
  }
}

export async function GET() {
  return NextResponse.json({
    templates: TEMPLATES,
    usage: 'POST { "to": "email@example.com", "template": "winback" }',
  })
}
