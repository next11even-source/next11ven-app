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

function baseTemplate(content: string, unsubscribeUrl?: string) {
  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:520px;margin:40px auto;background:#13172a;border-radius:16px;border:1px solid #1e2235;overflow:hidden;">
        <div style="padding:24px 28px 0;text-align:center;">
          <img src="${SITE}/logo.jpg" alt="NEXT11VEN" width="140" style="width:140px;height:auto;display:block;margin:0 auto;" />
        </div>
        <div style="padding:28px;">
          ${content}
        </div>
        <div style="padding:16px 28px 20px;border-top:1px solid #1e2235;text-align:center;">
          <p style="margin:0 0 6px;font-size:11px;color:#8892aa;">You're receiving this because you have an account on NEXT11VEN. <a href="${SITE}" style="color:#2d5fc4;">next11ven.com</a></p>
          <p style="margin:0;font-size:11px;color:#8892aa;">To manage your notification preferences, visit your <a href="${SITE}/dashboard/profile" style="color:#2d5fc4;">account settings</a> in the app.</p>
          ${unsubscribeUrl ? `<p style="margin:6px 0 0;font-size:11px;"><a href="${unsubscribeUrl}" style="color:#4b5563;">Unsubscribe from marketing emails</a></p>` : ''}
        </div>
      </div>
    </body>
    </html>
  `
}

function makeUnsubscribeUrl(playerId: string): string {
  return `${SITE}/api/unsubscribe?id=${playerId}`
}

// ─── Message notification ─────────────────────────────────────────────────────

export async function sendMessageNotificationEmail({
  to,
  toName,
  isCoach,
}: {
  to: string
  toName: string | null
  isCoach: boolean
}) {
  const dashboardUrl = isCoach
    ? `${SITE}/dashboard/coach/messages`
    : `${SITE}/dashboard/player/messages`

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${toName ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 6px;line-height:1.6;">
      You've received a new message on NEXT11VEN.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;font-size:13px;">Open the app to see who it's from and what they said.</p>
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View Message</a>
  `)

  await send({ to, subject: `You've received a new message`, html })
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

// ─── Extra Messages purchase confirmation ────────────────────────────────────

export async function sendExtraMessagesPurchaseEmail({
  to,
  playerName,
  credits,
  totalCredits,
}: {
  to: string
  playerName: string | null
  credits: number
  totalCredits: number
}) {
  const dashboardUrl = `${SITE}/dashboard/player/extra-messages`

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${playerName ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      Your purchase was successful. <strong style="color:#e8dece;">${credits} Extra Messages</strong> have been added to your account and are ready to use.
    </p>
    <div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:16px 20px;margin:0 0 24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 10px;">
        <span style="color:#8892aa;font-size:13px;">Credits added</span>
        <span style="color:#2d5fc4;font-weight:700;font-size:15px;">+${credits}</span>
      </div>
      <div style="border-top:1px solid #1e2235;padding-top:10px;display:flex;justify-content:space-between;align-items:center;">
        <span style="color:#8892aa;font-size:13px;">Total Extra Messages available</span>
        <span style="color:#e8dece;font-weight:700;font-size:15px;">${totalCredits}</span>
      </div>
    </div>
    <p style="color:#8892aa;margin:0 0 24px;font-size:13px;line-height:1.6;">
      Credits never expire and stack with any future purchases. They kick in automatically once your monthly messages run out.
    </p>
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View Your Balance</a>
  `)

  await send({ to, subject: `Your ${credits} Extra Messages are ready`, html })
}

// ─── Drip: Day 0 — coach messaged free player (upgrade to read) ─────────────

export async function sendDripDay0Email({
  to,
  toName,
  playerId,
}: {
  to: string
  toName: string | null
  playerId: string
}) {
  const upgradeUrl = `${SITE}/dashboard/player/premium`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${toName ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      A coach has sent you a message on NEXT11VEN. You need a premium account to read it and reply.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;font-size:13px;line-height:1.6;">
      Coaches are actively recruiting. Upgrade for £6.99/month and start the conversation before they move on.
    </p>
    <a href="${upgradeUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Upgrade &amp; Read Your Message</a>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject: 'A coach messaged you on NEXT11VEN', html })
}

// ─── Drip: Day 3 — unread message reminder ──────────────────────────────────

export async function sendDripDay3Email({
  to,
  toName,
  playerId,
}: {
  to: string
  toName: string | null
  playerId: string
}) {
  const upgradeUrl = `${SITE}/dashboard/player/premium`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${toName ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      You still have an unread message from a coach sitting in your NEXT11VEN inbox.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;font-size:13px;line-height:1.6;">
      Coaches are actively looking and won't wait indefinitely. Upgrade to premium to read the message and reply before it's too late.
    </p>
    <a href="${upgradeUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Read Your Message Now</a>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject: 'You still have an unread message waiting', html })
}

// ─── Drip: Day 7 — final reminder ────────────────────────────────────────────

export async function sendDripDay7Email({
  to,
  toName,
  playerId,
}: {
  to: string
  toName: string | null
  playerId: string
}) {
  const upgradeUrl = `${SITE}/dashboard/player/premium`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${toName ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      A coach messaged you on NEXT11VEN and their message is still sitting unread.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;font-size:13px;line-height:1.6;">
      Coaches don't wait forever. The longer this sits unread, the more likely they've moved on to someone else. Upgrade for £6.99/month and get your reply in.
    </p>
    <a href="${upgradeUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Upgrade &amp; Read Your Message</a>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject: "Don't let this coach move on without you", html })
}

// ─── Weekly views digest: free player ────────────────────────────────────────

export async function sendWeeklyViewsDigestFreeEmail({
  to,
  toName,
  coachCount,
  playerId,
}: {
  to: string
  toName: string | null
  coachCount: number
  playerId: string
}) {
  const upgradeUrl = `${SITE}/dashboard/player/premium`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 16px;">Hi ${toName ?? 'there'},</p>
    <div style="text-align:center;padding:20px 0 24px;">
      <p style="font-size:60px;font-weight:900;color:#e8dece;margin:0;line-height:1;font-family:Arial,sans-serif;">${coachCount}</p>
      <p style="font-size:15px;font-weight:700;color:#8892aa;margin:8px 0 0;letter-spacing:0.04em;text-transform:uppercase;">coach${coachCount === 1 ? '' : 'es'} viewed your profile in the last 7 days</p>
    </div>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      Coaches on NEXT11VEN are actively looking for players at your level.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Upgrade to Premium to see exactly who&rsquo;s been looking at you &mdash; and get in front of them first.
    </p>
    <div style="text-align:center;margin:0 0 20px;">
      <a href="${upgradeUrl}" style="display:inline-block;padding:14px 32px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">See Who Viewed You</a>
    </div>
    <p style="color:#4b5563;font-size:12px;text-align:center;margin:0;">Already thinking about it? Premium is &pound;6.99/month. Cancel anytime.</p>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject: `${coachCount} coach${coachCount === 1 ? '' : 'es'} viewed your profile this week`, html })
}

// ─── Weekly views digest: premium player ─────────────────────────────────────

export async function sendWeeklyViewsDigestPremiumEmail({
  to,
  toName,
  coachCount,
  coaches,
  playerId,
}: {
  to: string
  toName: string | null
  coachCount: number
  coaches: Array<{ full_name: string | null; club: string | null }>
  playerId: string
}) {
  const activityUrl = `${SITE}/dashboard/player/activity/profile-views`
  const coachListHtml = coaches.map(c => {
    const label = c.full_name
      ? (c.club ? `${c.full_name} &mdash; ${c.club}` : c.full_name)
      : 'Unknown coach'
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #1e2235;">
        <div style="width:8px;height:8px;border-radius:50%;background:#a78bfa;flex-shrink:0;"></div>
        <span style="color:#e8dece;font-size:14px;">${label}</span>
      </div>`
  }).join('')

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 16px;">Hi ${toName ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      <strong style="color:#e8dece;">${coachCount} coach${coachCount === 1 ? '' : 'es'}</strong> viewed your profile in the last 7 days. Here&rsquo;s who&rsquo;s been looking:
    </p>
    <div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:4px 20px 4px;margin:0 0 24px;">
      ${coachListHtml}
    </div>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Keep your profile sharp and stay active to keep attracting attention.
    </p>
    <div style="text-align:center;">
      <a href="${activityUrl}" style="display:inline-block;padding:14px 32px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">View Your Activity</a>
    </div>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject: `${coachCount} coach${coachCount === 1 ? '' : 'es'} checked out your profile this week`, html })
}

// ─── Billing: payment failed (transactional — never suppress) ────────────────

function firstName(name: string | null): string {
  if (!name) return 'there'
  return name.split(' ')[0]
}

export async function sendPaymentFailedEmail({
  to,
  toName,
}: {
  to: string
  toName: string | null
}) {
  const updateUrl = `${SITE}/dashboard/premium`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(toName)},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      We couldn't process your payment for NEXT11VEN Premium.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Your premium access has been paused. Update your payment details to restore it instantly.
    </p>
    <a href="${updateUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Update Payment Details</a>
    <p style="color:#8892aa;margin:20px 0 0;font-size:13px;">If you think this is a mistake, reply to this email and we'll sort it.</p>
  `)
  await send({ to, subject: 'Your NEXT11VEN payment failed', html })
}

export async function sendPaymentFailedFollowUpEmail({
  to,
  toName,
}: {
  to: string
  toName: string | null
}) {
  const updateUrl = `${SITE}/dashboard/premium`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(toName)},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      Your NEXT11VEN Premium payment still hasn't gone through and your access remains paused.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Update your card details to get back in.
    </p>
    <a href="${updateUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Update Payment Details</a>
    <p style="color:#8892aa;margin:20px 0 0;font-size:13px;">If you think this is a mistake, reply to this email and we'll sort it.</p>
  `)
  await send({ to, subject: 'Still having trouble with your payment?', html })
}

// ─── Billing: subscription cancelled win-back (transactional — never suppress) ─

export async function sendSubscriptionCancelledWinBackEmail({
  to,
  toName,
  opportunityCount,
}: {
  to: string
  toName: string | null
  opportunityCount?: number
}) {
  const rejoinUrl = `${SITE}/dashboard/premium`
  const opportunityLine =
    typeof opportunityCount === 'number'
      ? `<p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">Since you left, <strong style="color:#e8dece;">${opportunityCount} new ${opportunityCount === 1 ? 'opportunity has' : 'opportunities have'} been posted</strong> by coaches actively looking for players.</p>`
      : ''
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(toName)},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      Your NEXT11VEN Premium membership has ended.
    </p>
    ${opportunityLine}
    <a href="${rejoinUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Rejoin Premium</a>
    <p style="color:#8892aa;margin:20px 0 0;font-size:13px;">Questions? Just reply to this email.</p>
  `)
  await send({ to, subject: "We'd love to have you back", html })
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

// ─── Weekly coach recommendations digest ──────────────────────────────────────

export type RecommendationEmailPlayer = {
  id: string
  full_name: string | null
  avatar_url: string | null
  position: string | null
  playing_level: string | null
  status: string | null
  city: string | null
}

const REC_STATUS_LABELS: Record<string, string> = {
  free_agent: 'Free Agent',
  signed: 'Signed to a club',
  loan_dual_reg: 'Open to Loan / Dual Reg',
  just_exploring: 'Just Exploring',
}

function recommendationCard(p: RecommendationEmailPlayer): string {
  const name = p.full_name ?? 'Player'
  const firstNm = name.split(' ')[0]
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const profileUrl = `${SITE}/dashboard/player/players/${p.id}`
  const statusLabel = p.status ? REC_STATUS_LABELS[p.status] : null
  const isFreeAgent = p.status === 'free_agent'
  const meta = [p.position, p.playing_level, p.city].filter(Boolean).join(' · ')

  const avatar = p.avatar_url
    ? `<img src="${p.avatar_url}" alt="" width="56" height="56" style="width:56px;height:56px;border-radius:12px;object-fit:cover;display:block;" />`
    : `<div style="width:56px;height:56px;border-radius:12px;background:#1a1f3a;color:#2d5fc4;font-weight:800;font-size:20px;text-align:center;line-height:56px;">${initials}</div>`

  return `
    <div style="background:#0a0a0a;border:1px solid #1e2235;border-radius:14px;padding:16px;margin:0 0 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td width="56" style="vertical-align:top;">${avatar}</td>
          <td style="vertical-align:top;padding-left:14px;">
            <p style="margin:0 0 2px;color:#e8dece;font-weight:700;font-size:15px;">${name}</p>
            <p style="margin:0 0 6px;color:#8892aa;font-size:12px;">${meta || '—'}</p>
            ${statusLabel ? `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:${isFreeAgent ? 'rgba(96,165,250,0.15)' : 'rgba(136,146,170,0.15)'};color:${isFreeAgent ? '#60a5fa' : '#8892aa'};">${statusLabel}</span>` : ''}
          </td>
        </tr>
      </table>
      <a href="${profileUrl}" style="display:block;margin-top:14px;padding:11px 0;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:13px;text-align:center;">View &amp; Message ${firstNm}</a>
    </div>
  `
}

export async function sendCoachRecommendationsEmail({
  to,
  coachName,
  players,
}: {
  to: string
  coachName: string | null
  players: RecommendationEmailPlayer[]
}) {
  const count = players.length
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(coachName)},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      Based on the players you've been looking at, here ${count === 1 ? 'is one player' : `are ${count} players`} we think ${count === 1 ? 'is' : 'are'} worth a closer look this week.
    </p>
    ${players.map(recommendationCard).join('')}
    <p style="color:#8892aa;margin:16px 0 0;font-size:12px;line-height:1.6;">
      These picks come from your search activity on NEXT11VEN — the more you browse, the sharper they get.
    </p>
  `)

  await send({
    to,
    subject:
      count === 1
        ? `A player we think you'd want to know about`
        : `${count} players we think you'd want to know about`,
    html,
  })
}
