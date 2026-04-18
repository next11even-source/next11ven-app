/**
 * Transactional email via Resend REST API — server-side only.
 * Never import this in client components.
 *
 * Required env vars:
 *   RESEND_API_KEY       — from resend.com
 *   RESEND_ENABLED       — set to 'false' in local dev, 'true' in production
 *   RESEND_FROM_EMAIL    — e.g. "NEXT11VEN <notifications@next11ven.com>"
 */

const FROM = process.env.RESEND_FROM_EMAIL ?? 'NEXT11VEN <hello@next11ven.com>'
const SITE = process.env.APP_URL ?? 'https://app.next11ven.com'

async function send({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (process.env.RESEND_ENABLED === 'false') {
    console.log(`[Email] disabled — skipping "${subject}" to ${to}`)
    return
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not set — skipping')
    return
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('[Email] Resend error:', res.status, body)
    }
  } catch (err) {
    console.error('[Email] send error:', err)
  }
}

function baseTemplate(content: string) {
  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:520px;margin:40px auto;background:#13172a;border-radius:16px;border:1px solid #1e2235;overflow:hidden;">
        <div style="padding:24px 28px 0;text-align:center;">
          <p style="font-size:22px;font-weight:900;letter-spacing:0.05em;color:#e8dece;margin:0;text-transform:uppercase;font-family:Arial Black,Arial,sans-serif;">NEXT11VEN</p>
        </div>
        <div style="padding:28px;">
          ${content}
        </div>
        <div style="padding:16px 28px 20px;border-top:1px solid #1e2235;text-align:center;">
          <p style="margin:0;font-size:11px;color:#8892aa;">You're receiving this because you have an account on NEXT11VEN. <a href="${SITE}" style="color:#2d5fc4;">next11ven.com</a></p>
        </div>
      </div>
    </body>
    </html>
  `
}

// ─── Message notification ─────────────────────────────────────────────────────

export async function sendMessageNotificationEmail({
  to,
  toName,
  fromName,
  isCoach,
}: {
  to: string
  toName: string | null
  fromName: string | null
  isCoach: boolean
}) {
  const dashboardUrl = isCoach
    ? `${SITE}/dashboard/coach/messages`
    : `${SITE}/dashboard/player/messages`

  const senderLabel = isCoach ? 'a player' : 'a coach'
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${toName ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      ${fromName ? `<strong style="color:#e8dece;">${fromName}</strong>` : `Someone (${senderLabel})`} sent you a message on NEXT11VEN.
    </p>
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Read Message</a>
  `)

  await send({ to, subject: `New message on NEXT11VEN`, html })
}

// ─── Application received (coach) ─────────────────────────────────────────────

export async function sendApplicationReceivedEmail({
  to,
  coachName,
  playerName,
  opportunityTitle,
}: {
  to: string
  coachName: string | null
  playerName: string | null
  opportunityTitle: string
}) {
  const dashboardUrl = `${SITE}/dashboard/coach/opportunities`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${coachName ?? 'Coach'},</p>
    <p style="color:#8892aa;margin:0 0 8px;line-height:1.6;">
      <strong style="color:#e8dece;">${playerName ?? 'A player'}</strong> has applied to your opportunity:
    </p>
    <p style="color:#e8dece;font-weight:700;margin:0 0 20px;font-size:15px;">${opportunityTitle}</p>
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View Application</a>
  `)

  await send({ to, subject: `New application: ${opportunityTitle}`, html })
}
