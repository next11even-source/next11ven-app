import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAudienceRecipients } from '@/lib/broadcastAudience'
import { sendBroadcastEmail } from '@/lib/email'
import { logTouch } from '@/lib/touchpoint'

export const runtime = 'nodejs'
export const maxDuration = 300

const CONCURRENCY = 4
const SITE = process.env.APP_URL ?? 'https://app.next11ven.com'

const SendSchema = z.object({
  subject: z.string().min(1).max(200),
  headline: z.string().max(200).optional(),
  bodyText: z.string().min(10).max(10000),
  ctaLabel: z.string().max(100).optional(),
  ctaUrl: z.string().url().optional(),
  filter: z.object({
    role: z.enum(['all', 'player', 'coach']),
    tier: z.enum(['all', 'pro', 'free']),
    joined: z.enum(['all', '7d', '14d', '30d', '90d']),
    activity: z.enum(['all', 'never_active', 'active_30d']),
  }),
})

function buildContentHtml(
  recipientName: string | null,
  { headline, bodyText, ctaLabel, ctaUrl }: {
    headline?: string
    bodyText: string
    ctaLabel?: string
    ctaUrl?: string
  }
): string {
  const name = recipientName?.split(' ')[0] ?? 'there'
  const r = (s: string) => s.replace(/\{\{name\}\}/g, name)

  const headlinePart = headline?.trim()
    ? `<h2 style="color:#e8dece;font-size:20px;font-weight:700;margin:0 0 16px;line-height:1.3;">${r(headline)}</h2>`
    : ''

  const paragraphs = bodyText
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">${r(p).replace(/\n/g, '<br>')}</p>`)
    .join('')

  const ctaPart = ctaLabel && ctaUrl
    ? `<a href="${r(ctaUrl)}" style="display:block;padding:14px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;text-align:center;margin:24px 0 0;">${r(ctaLabel)}</a>`
    : ''

  return headlinePart + paragraphs + ctaPart
}

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

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (caller?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let rawBody: unknown
  try { rawBody = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = SendSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { subject, headline, bodyText, ctaLabel, ctaUrl, filter } = parsed.data

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let recipients
  try {
    recipients = await getAudienceRecipients(service, filter)
  } catch (err) {
    console.error('[broadcast/send] audience query failed:', err)
    return NextResponse.json({ error: 'Audience query failed' }, { status: 500 })
  }

  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, recipientCount: 0 })
  }

  // Write the broadcast log before sending so it exists even if sends partially fail
  const { data: logRow } = await service
    .from('broadcast_logs')
    .insert({
      created_by: user.id,
      subject,
      audience_filter: filter,
      recipient_count: recipients.length,
    })
    .select('id')
    .single()

  let sent = 0
  let failed = 0

  async function sendToRecipient(r: { id: string; email: string; full_name: string | null }) {
    try {
      const unsubscribeUrl = `${SITE}/api/unsubscribe?id=${r.id}`
      const contentHtml = buildContentHtml(r.full_name, { headline, bodyText, ctaLabel, ctaUrl })
      await sendBroadcastEmail({ to: r.email, subject, contentHtml, unsubscribeUrl, broadcastId: logRow?.id })
      await logTouch(service, r.id, 'email', 'broadcast')
      sent++
    } catch (err) {
      console.error(`[broadcast/send] failed for ${r.id}:`, err)
      failed++
    }
  }

  for (let i = 0; i < recipients.length; i += CONCURRENCY) {
    await Promise.all(recipients.slice(i, i + CONCURRENCY).map(sendToRecipient))
  }

  // Update log with final counts
  if (logRow?.id) {
    await service
      .from('broadcast_logs')
      .update({ sent_count: sent, failed_count: failed })
      .eq('id', logRow.id)
  }

  return NextResponse.json({ sent, failed, recipientCount: recipients.length })
}
