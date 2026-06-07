import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const SITE = process.env.APP_URL ?? 'https://app.next11ven.com'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function html(title: string, body: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — NEXT11VEN</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:480px;margin:60px auto;padding:0 20px;text-align:center;">
    <img src="${SITE}/logo.jpg" alt="NEXT11VEN" width="120" style="width:120px;height:auto;margin:0 auto 32px;display:block;" />
    ${body}
    <p style="margin:32px 0 0;font-size:12px;color:#4b5563;">
      <a href="${SITE}/dashboard/player" style="color:#2d5fc4;text-decoration:none;">Back to the app</a>
    </p>
  </div>
</body>
</html>`
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')

  if (!id || !UUID_RE.test(id)) {
    return new NextResponse(
      html('Invalid link', `
        <h1 style="font-family:'Barlow Condensed',Arial,sans-serif;font-weight:900;font-size:28px;color:#e8dece;text-transform:uppercase;margin:0 0 12px;">Invalid link</h1>
        <p style="color:#8892aa;font-size:15px;line-height:1.6;margin:0;">This unsubscribe link isn't valid. If you need help, contact us at <a href="mailto:hello@next11ven.com" style="color:#2d5fc4;">hello@next11ven.com</a>.</p>
      `),
      { status: 400, headers: { 'Content-Type': 'text/html' } }
    )
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabase
    .from('profiles')
    .update({ email_marketing_opt_out: true })
    .eq('id', id)

  if (error) {
    console.error('[unsubscribe] update error:', error)
    return new NextResponse(
      html('Something went wrong', `
        <h1 style="font-family:'Barlow Condensed',Arial,sans-serif;font-weight:900;font-size:28px;color:#e8dece;text-transform:uppercase;margin:0 0 12px;">Something went wrong</h1>
        <p style="color:#8892aa;font-size:15px;line-height:1.6;margin:0;">We couldn't process your request. Please try again or contact <a href="mailto:hello@next11ven.com" style="color:#2d5fc4;">hello@next11ven.com</a>.</p>
      `),
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    )
  }

  return new NextResponse(
    html('Unsubscribed', `
      <h1 style="font-family:'Barlow Condensed',Arial,sans-serif;font-weight:900;font-size:32px;color:#e8dece;text-transform:uppercase;margin:0 0 12px;">You're unsubscribed</h1>
      <p style="color:#8892aa;font-size:15px;line-height:1.6;margin:0 0 16px;">You won't receive any more marketing emails from NEXT11VEN.</p>
      <p style="color:#4b5563;font-size:13px;line-height:1.6;margin:0;">Changed your mind? You can re-enable emails from your <a href="${SITE}/dashboard/profile" style="color:#2d5fc4;">profile settings</a> in the app.</p>
    `),
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}
