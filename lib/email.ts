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
          <p style="margin:0 0 6px;font-size:11px;color:#8892aa;">You're receiving this because you have an account on NEXT11VEN. <a href="${SITE}" style="color:#2d5fc4;">next11ven.com</a></p>
          <p style="margin:0;font-size:11px;color:#8892aa;">To manage your notification preferences, visit your <a href="${SITE}/dashboard/profile" style="color:#2d5fc4;">account settings</a> in the app.</p>
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
  senderLabel,
  isCoach,
}: {
  to: string
  toName: string | null
  senderLabel: string
  isCoach: boolean
}) {
  const dashboardUrl = isCoach
    ? `${SITE}/dashboard/coach/messages`
    : `${SITE}/dashboard/player/messages`

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${toName ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 6px;line-height:1.6;">
      <strong style="color:#e8dece;">${senderLabel}</strong> has sent you a DM on NEXT11VEN.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;font-size:13px;">Open the app to see who it is and what they said.</p>
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View Message</a>
  `)

  await send({ to, subject: `You have a new DM on NEXT11VEN`, html })
}

// ─── Application decision (player) ───────────────────────────────────────────

export async function sendApplicationDecisionEmail({
  to,
  playerName,
  opportunityTitle,
  status,
  message,
}: {
  to: string
  playerName: string | null
  opportunityTitle: string
  status: 'accepted' | 'rejected'
  message: string | null
}) {
  const isAccepted = status === 'accepted'
  const dashboardUrl = `${SITE}/dashboard/player/market`
  const accentColor = isAccepted ? '#2d5fc4' : '#6b7280'
  const badgeText = isAccepted ? '✅ Accepted' : '❌ Not Progressed'

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${playerName ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 8px;line-height:1.6;">
      A coach has reviewed your application for:
    </p>
    <p style="color:#e8dece;font-weight:700;margin:0 0 16px;font-size:15px;">${opportunityTitle}</p>
    <p style="display:inline-block;padding:6px 14px;border-radius:20px;font-weight:700;font-size:13px;margin:0 0 20px;background:${isAccepted ? 'rgba(45,95,196,0.15)' : 'rgba(107,114,128,0.15)'};color:${accentColor};">${badgeText}</p>
    ${message ? `<p style="color:#8892aa;margin:16px 0 20px;font-size:13px;line-height:1.6;font-style:italic;">"${message}"</p>` : ''}
    ${isAccepted ? `<p style="color:#8892aa;margin:0 0 20px;line-height:1.6;font-size:13px;">Log in to view your application and any next steps from the coach.</p>` : `<p style="color:#8892aa;margin:0 0 20px;line-height:1.6;font-size:13px;">Don't be discouraged — keep your profile updated and apply for more roles.</p>`}
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:${accentColor};color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View My Applications</a>
  `)

  await send({
    to,
    subject: isAccepted
      ? `Your application for "${opportunityTitle}" has been accepted`
      : `Update on your application for "${opportunityTitle}"`,
    html,
  })
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
