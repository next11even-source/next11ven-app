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

async function send({ to, subject, html, tags, isTest }: {
  to: string
  subject: string
  html: string
  tags?: Array<{ name: string; value: string }>
  isTest?: boolean
}) {
  const resolvedTags = isTest && tags?.length
    ? tags.map(t => t.name === 'flow' ? { ...t, value: `test_${t.value}` } : t)
    : tags
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
      body: JSON.stringify({ from: FROM, to, subject, html, ...(resolvedTags?.length ? { tags: resolvedTags } : {}) }),
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

// Marketing template — for win-back and re-engagement sends.
// Visually distinct from baseTemplate: blue hero band, wider card, prominent
// unsubscribe. All marketing sends must pass a valid unsubscribeUrl.
function marketingTemplate(content: string, unsubscribeUrl: string) {
  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#0a0a0a;font-family:Inter,Arial,sans-serif;">
      <div style="max-width:560px;margin:40px auto;">
        <div style="background:#2d5fc4;border-radius:16px 16px 0 0;padding:32px 28px;text-align:center;">
          <img src="${SITE}/logo.jpg" alt="NEXT11VEN" width="120" style="width:120px;height:auto;display:block;margin:0 auto;" />
        </div>
        <div style="background:#13172a;border:1px solid #1e2235;border-top:none;border-radius:0 0 16px 16px;padding:36px 32px;">
          ${content}
        </div>
        <div style="padding:20px 32px 36px;text-align:center;">
          <p style="margin:0 0 6px;font-size:11px;color:#4b5563;">You're receiving this because you had a NEXT11VEN Pro membership.</p>
          <a href="${unsubscribeUrl}" style="font-size:11px;color:#4b5563;text-decoration:underline;">Unsubscribe from marketing emails</a>
        </div>
      </div>
    </body>
    </html>
  `
}

function makeUnsubscribeUrl(playerId: string): string {
  return `${SITE}/api/unsubscribe?id=${playerId}`
}

// ─── Broadcast (admin-composed emails) ───────────────────────────────────────
// Content is pre-built by the send route. This wrapper applies marketingTemplate
// and fires. The unsubscribeUrl is always required for broadcast sends.

export async function sendBroadcastEmail({
  to,
  subject,
  contentHtml,
  unsubscribeUrl,
  broadcastId,
  isTest,
}: {
  to: string
  subject: string
  contentHtml: string
  unsubscribeUrl: string
  broadcastId?: string
  isTest?: boolean
}) {
  const html = marketingTemplate(contentHtml, unsubscribeUrl)
  // Always tag: named flows get their broadcastId, anonymous sends fall back to 'broadcast'
  const tags = [{ name: 'flow', value: broadcastId ?? 'broadcast' }]
  await send({ to, subject, html, tags, isTest })
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

  await send({ to, subject: `You've received a new message`, html, tags: [{ name: 'flow', value: 'message_notification' }] })
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
    tags: [{ name: 'flow', value: 'application_decision' }],
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

  await send({ to, subject: `Your ${credits} Extra Messages are ready`, html, tags: [{ name: 'flow', value: 'message_pack_purchase' }] })
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
      A coach has sent you a message on NEXT11VEN. You need a Pro account to read it and reply.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;font-size:13px;line-height:1.6;">
      Coaches are actively recruiting. Upgrade for £6.99/month and start the conversation before they move on.
    </p>
    <a href="${upgradeUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Upgrade &amp; Read Your Message</a>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject: 'A coach messaged you on NEXT11VEN', html, tags: [{ name: 'flow', value: 'drip_day0' }] })
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
      Coaches are actively looking and won't wait indefinitely. Upgrade to Pro to read the message and reply before it's too late.
    </p>
    <a href="${upgradeUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Read Your Message Now</a>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject: 'You still have an unread message waiting', html, tags: [{ name: 'flow', value: 'drip_day3' }] })
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
  await send({ to, subject: "Don't let this coach move on without you", html, tags: [{ name: 'flow', value: 'drip_day7' }] })
}

// ─── Post-match log nudge (engagement — suppressible via email_marketing_opt_out) ─
// The intake valve for the tracker flywheel: a light "log yesterday's game"
// prompt the day after the player's likely match day. Free feature — no upsell.

export async function sendLogNudgeEmail({
  to,
  toName,
  playerId,
}: {
  to: string
  toName: string | null
  playerId: string
}) {
  const logUrl = `${SITE}/dashboard/performance/tracker/log`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${toName ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      Played this weekend? Get it on the record before it fades. Logging a game takes about 20 seconds — goals, assists, minutes, done.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;font-size:13px;line-height:1.6;">
      Every game you log builds your season stats and keeps your profile current for the coaches looking at you.
    </p>
    <a href="${logUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Log your match</a>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject: 'Played this weekend? Log it in 20 seconds', html, tags: [{ name: 'flow', value: 'log_nudge' }] })
}

// ─── Coach activation (coach has never posted a role) ────────────────────────
// Two-step cadence — see /api/cron/coach-activation for timing logic.
// Step D7: soft nudge, surface what's available to them (region player count).
// Step D21: different angle — social proof (coaches active this week).
// Respects email_marketing_opt_out at the call site.
// Uses baseTemplate (product nudge, not a marketing win-back).

// D7 — "here's who's available in your area"
// regionPlayerCount: actively-looking players in the coach's city (or platform
// total if the coach has no city on file). regionLabel: the city string or null
// (null = platform total, used to render "in [city]" vs "on the platform").
export async function sendCoachActivationD7Email({
  to,
  coachName,
  coachId,
  regionPlayerCount,
  regionLabel,
  isTest,
}: {
  to: string
  coachName: string | null
  coachId: string
  regionPlayerCount: number
  regionLabel: string | null
  isTest?: boolean
}) {
  const postUrl = `${SITE}/dashboard/opportunities?tab=mine`
  const unsubscribeUrl = makeUnsubscribeUrl(coachId)

  const locationLine = regionLabel ? `in ${regionLabel}` : 'on the platform'
  const subject = regionPlayerCount > 0
    ? `${regionPlayerCount} players ${locationLine} are looking for a club`
    : 'Players in your area are looking for a club'

  const statBlock = regionPlayerCount > 0
    ? `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
        <p style="color:#4d8ae8;font-weight:700;font-size:32px;margin:0 0 4px;line-height:1;">${regionPlayerCount}</p>
        <p style="color:#8892aa;font-size:13px;margin:0;">players ${locationLine} actively looking for a club</p>
      </div>`
    : ''

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(coachName)},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      You joined NEXT11VEN but haven't posted a role yet. Here's what's waiting for you.
    </p>
    ${statBlock}
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      These are real players — approved profiles, actively looking — who can apply to your role the same day you post it.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Posting takes 2 minutes. It costs nothing.
    </p>
    <a href="${postUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Post your first role</a>
  `, unsubscribeUrl)

  await send({ to, subject, html, tags: [{ name: 'flow', value: 'coach_activation_d7' }], isTest })
}

// D21 — different angle: social proof, not a louder version of D7.
// If the region stat didn't move them, a bigger number won't either.
// coachesPostedThisWeek: COUNT of distinct coaches who posted ≥1 opportunity
// in the last 7 days — queried once per run and passed in.
export async function sendCoachActivationD21Email({
  to,
  coachName,
  coachId,
  coachesPostedThisWeek,
  isTest,
}: {
  to: string
  coachName: string | null
  coachId: string
  coachesPostedThisWeek: number
  isTest?: boolean
}) {
  const postUrl = `${SITE}/dashboard/opportunities?tab=mine`
  const unsubscribeUrl = makeUnsubscribeUrl(coachId)

  const socialLine = coachesPostedThisWeek > 1
    ? `${coachesPostedThisWeek} coaches posted a role on NEXT11VEN this week.`
    : coachesPostedThisWeek === 1
    ? '1 coach posted a role on NEXT11VEN this week.'
    : 'Coaches are posting roles on NEXT11VEN every week.'

  const statBlock = coachesPostedThisWeek > 0
    ? `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
        <p style="color:#4d8ae8;font-weight:700;font-size:32px;margin:0 0 4px;line-height:1;">${coachesPostedThisWeek}</p>
        <p style="color:#8892aa;font-size:13px;margin:0;">coaches posted a role this week</p>
      </div>`
    : ''

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(coachName)},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      ${socialLine} You still haven't posted yours.
    </p>
    ${statBlock}
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      Every role they posted is a pool of applicants they now have. Every week you wait is a week other coaches are ahead.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Post a role today and players can apply by tonight.
    </p>
    <a href="${postUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Post your first role</a>
  `, unsubscribeUrl)

  await send({ to, subject: `${coachesPostedThisWeek > 0 ? `${coachesPostedThisWeek} coaches posted this week` : 'Other coaches are posting'} — are you?`, html, tags: [{ name: 'flow', value: 'coach_activation_d21' }], isTest })
}

// ─── Coach gone quiet: D1 — new players have joined since you last posted ─────
// Fires when a coach posted at least once ever but has had no new opportunity
// in >= 28 days. Different from coach-activation: this coach has been active,
// just not recently. Angle: what they're missing — demand they've already proven
// appetite for, now landing on their competition.
// newPlayerCount: approved players who joined AFTER the coach's last post date.
// daysSinceLastPost: integer, for the subject line.
export async function sendCoachGoneQuietD1Email({
  to,
  coachName,
  coachId,
  newPlayerCount,
  daysSinceLastPost,
  isTest,
}: {
  to: string
  coachName: string | null
  coachId: string
  newPlayerCount: number
  daysSinceLastPost: number
  isTest?: boolean
}) {
  const postUrl = `${SITE}/dashboard/opportunities?tab=mine`
  const unsubscribeUrl = makeUnsubscribeUrl(coachId)

  const subject = newPlayerCount > 0
    ? `${newPlayerCount} new players joined since you last posted`
    : `It's been ${daysSinceLastPost} days since your last role — players are waiting`

  const statBlock = newPlayerCount > 0
    ? `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
        <p style="color:#4d8ae8;font-weight:700;font-size:32px;margin:0 0 4px;line-height:1;">${newPlayerCount}</p>
        <p style="color:#8892aa;font-size:13px;margin:0;">new players joined NEXT11VEN since you last posted</p>
      </div>`
    : ''

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(coachName)},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      It's been ${daysSinceLastPost} days since you last posted a role on NEXT11VEN.
    </p>
    ${statBlock}
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      ${newPlayerCount > 0
        ? 'These are approved, verified players — none of them have seen a role from you yet.'
        : 'Players are joining every week and actively browsing for opportunities like yours.'}
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Post a role today and they can apply by tonight.
    </p>
    <a href="${postUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Post a role</a>
  `, unsubscribeUrl)

  await send({ to, subject, html, tags: [{ name: 'flow', value: 'coach_gone_quiet_d1' }], isTest })
}

// ─── Coach gone quiet: D14 — social proof, different angle from D1 ────────────
// Fires >= 14 days after D1 if the coach still hasn't posted. D1 led with
// demand they're missing (new players); D14 leads with peer activity (social
// proof). Same angle as coach-activation D21 — if the first stat didn't land,
// peer comparison is the next lever.
// coachesPostedThisWeek: COUNT of distinct coaches who posted in the last 7 days.
export async function sendCoachGoneQuietD14Email({
  to,
  coachName,
  coachId,
  coachesPostedThisWeek,
  isTest,
}: {
  to: string
  coachName: string | null
  coachId: string
  coachesPostedThisWeek: number
  isTest?: boolean
}) {
  const postUrl = `${SITE}/dashboard/opportunities?tab=mine`
  const unsubscribeUrl = makeUnsubscribeUrl(coachId)

  const socialLine = coachesPostedThisWeek > 1
    ? `${coachesPostedThisWeek} coaches posted a role on NEXT11VEN this week.`
    : coachesPostedThisWeek === 1
    ? '1 coach posted a role on NEXT11VEN this week.'
    : 'Coaches are posting roles on NEXT11VEN every week.'

  const statBlock = coachesPostedThisWeek > 0
    ? `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
        <p style="color:#4d8ae8;font-weight:700;font-size:32px;margin:0 0 4px;line-height:1;">${coachesPostedThisWeek}</p>
        <p style="color:#8892aa;font-size:13px;margin:0;">coaches posted a role this week</p>
      </div>`
    : ''

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(coachName)},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      ${socialLine} Your last role closed weeks ago.
    </p>
    ${statBlock}
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      Every role they posted is a pipeline they now have. The players who applied to them this week aren't browsing your old role — it's gone.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Post a new role and get back in front of them.
    </p>
    <a href="${postUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Post a role</a>
  `, unsubscribeUrl)

  await send({ to, subject: `${coachesPostedThisWeek > 0 ? `${coachesPostedThisWeek} coaches posted this week` : 'Other coaches are posting'} — where are you?`, html, tags: [{ name: 'flow', value: 'coach_gone_quiet_d14' }], isTest })
}

// ─── Application nudge (coach owes players an answer) ────────────────────────
// Operational, not promotional: these are applications to a role THIS coach
// posted. Still respects email_marketing_opt_out at the call site — see the
// cron for that decision.

export async function sendApplicationNudgeEmail({
  to,
  coachName,
  total,
  overdue,
  oldestDays,
  atRiskCount,
  atRiskDaysLeft,
  isTest,
}: {
  to: string
  coachName: string | null
  total: number
  overdue: number
  oldestDays: number
  /** Roles about to auto-close under the neglect rule — see lib/opportunityLifecycle.ts */
  atRiskCount?: number
  /** Days left on the soonest at-risk role before it auto-closes */
  atRiskDaysLeft?: number
  isTest?: boolean
}) {
  const url = `${SITE}/dashboard/opportunities?tab=mine`
  const plural = total === 1 ? 'player is' : 'players are'
  // Lead with the players, never with the coach's failure — these are unpaid
  // volunteers at non-league clubs, and shaming them just loses the coach.
  const overdueLine = overdue > 0
    ? `<p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">${overdue === 1 ? 'One has' : `${overdue} have`} been waiting over a week${oldestDays >= 30 ? `, and the longest has been waiting ${Math.floor(oldestDays / 30)} month${oldestDays >= 60 ? 's' : ''}` : ''}.</p>`
    : ''
  // Rides the same send as the backlog nudge rather than a separate message —
  // see /api/cron/application-nudge for why this is folded in instead of new.
  const atRiskLine = atRiskCount && atRiskCount > 0
    ? `<p style="color:#f59e0b;margin:0 0 16px;line-height:1.6;">${atRiskCount === 1 ? 'One role closes' : `${atRiskCount} roles close`} automatically in ${atRiskDaysLeft} day${atRiskDaysLeft === 1 ? '' : 's'} if nobody's answered — players shouldn't keep applying somewhere nobody's reading.</p>`
    : ''
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${coachName?.split(' ')[0] ?? 'there'},</p>
    <p style="color:#e8dece;margin:0 0 16px;line-height:1.6;font-size:16px;">
      <strong>${total} ${plural} waiting to hear back from you.</strong>
    </p>
    ${overdueLine}
    ${atRiskLine}
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      A no is still an answer, and it takes one tap. Players who never hear back
      assume nobody read it — the ones you pass on today will remember that you replied.
    </p>
    <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Review your applicants</a>
  `)
  await send({
    to,
    subject: total === 1 ? '1 player is waiting on your answer' : `${total} players are waiting on your answer`,
    html,
    tags: [{ name: 'flow', value: 'application_nudge' }],
    isTest,
  })
}

// ─── Opportunity auto-close (transactional — role deactivated on the coach's
// behalf; see /api/cron/opportunity-close and lib/opportunityLifecycle.ts) ────

export async function sendOpportunityAutoClosedEmail({
  to,
  coachName,
  roles,
}: {
  to: string
  coachName: string | null
  roles: Array<{ title: string; reason: 'stale' | 'neglected' }>
}) {
  const url = `${SITE}/dashboard/opportunities?tab=mine`
  const plural = roles.length === 1 ? 'role' : 'roles'
  const reasonLine = (r: 'stale' | 'neglected') =>
    r === 'neglected'
      ? 'applicants were still waiting on an answer'
      : 'it had been open a while with no update'
  const list = roles.map(r => `<li style="color:#e8dece;margin-bottom:6px;">${r.title} <span style="color:#8892aa;">— ${reasonLine(r.reason)}</span></li>`).join('')
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${coachName?.split(' ')[0] ?? 'there'},</p>
    <p style="color:#e8dece;margin:0 0 16px;line-height:1.6;font-size:16px;">
      <strong>${roles.length === 1 ? 'A role' : `${roles.length} roles`} of yours came down automatically.</strong>
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;">${list}</ul>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      We hide ${plural} that go quiet so players aren't applying somewhere nobody's
      reading. Nothing's deleted — reopen ${roles.length === 1 ? 'it' : 'any of them'} in one tap if you're still recruiting.
    </p>
    <a href="${url}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Review your roles</a>
  `)
  await send({
    to,
    subject: roles.length === 1 ? 'A role of yours was closed automatically' : `${roles.length} roles of yours were closed automatically`,
    html,
    tags: [{ name: 'flow', value: 'opportunity_auto_closed' }],
  })
}

// ─── Weekly digest (marketing — suppressible via email_marketing_opt_out) ────
// Body is built + validated in lib/weeklyDigest.ts. This wrapper only frames it
// in the base template and sends. Keep the transport thin.

export async function sendWeeklyDigestEmail({
  to,
  playerId,
  subject,
  contentHtml,
  isTest,
}: {
  to: string
  playerId: string
  subject: string
  contentHtml: string
  isTest?: boolean
}) {
  const html = baseTemplate(contentHtml, makeUnsubscribeUrl(playerId))
  await send({ to, subject, html, tags: [{ name: 'flow', value: 'weekly_digest' }], isTest })
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
      We couldn't process your payment for NEXT11VEN Pro.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Your Pro access has been paused. Update your payment details to restore it instantly.
    </p>
    <a href="${updateUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Update Payment Details</a>
    <p style="color:#8892aa;margin:20px 0 0;font-size:13px;">If you think this is a mistake, reply to this email and we'll sort it.</p>
  `)
  await send({ to, subject: 'Your NEXT11VEN payment failed', html, tags: [{ name: 'flow', value: 'payment_failed' }] })
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
      Your NEXT11VEN Pro payment still hasn't gone through and your access remains paused.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Update your card details to get back in.
    </p>
    <a href="${updateUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Update Payment Details</a>
    <p style="color:#8892aa;margin:20px 0 0;font-size:13px;">If you think this is a mistake, reply to this email and we'll sort it.</p>
  `)
  await send({ to, subject: 'Still having trouble with your payment?', html, tags: [{ name: 'flow', value: 'payment_failed_followup' }] })
}

// ─── Billing: subscription cancelled win-back (marketing — respects opt-out) ──
// Uses marketingTemplate to distinguish it visually from transactional sends.
// userId is required so the unsubscribe link is always present.

export async function sendSubscriptionCancelledWinBackEmail({
  to,
  toName,
  userId,
  opportunityCount,
  playerPosition,
  isTest,
}: {
  to: string
  toName: string | null
  userId: string
  opportunityCount?: number
  playerPosition?: string | null
  isTest?: boolean
}) {
  const rejoinUrl = `${SITE}/dashboard/premium`
  const unsubscribeUrl = makeUnsubscribeUrl(userId)

  const statLabel = playerPosition
    ? `new ${playerPosition} ${opportunityCount === 1 ? 'role has' : 'roles have'} been posted in the last 30 days`
    : `new ${opportunityCount === 1 ? 'role has' : 'roles have'} been posted in the last 30 days`

  const statBlock =
    typeof opportunityCount === 'number' && opportunityCount > 0
      ? `
        <div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
          <p style="color:#e8dece;font-weight:700;font-size:32px;margin:0 0 4px;line-height:1;">${opportunityCount}</p>
          <p style="color:#8892aa;font-size:13px;margin:0;">${statLabel}</p>
        </div>`
      : ''

  const html = marketingTemplate(`
    <h2 style="color:#e8dece;font-size:20px;font-weight:700;margin:0 0 16px;line-height:1.3;">Come back before coaches move on.</h2>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      Hi ${firstName(toName)}, your Pro membership has ended. Coaches are still recruiting — here's what's been posted while you've been away.
    </p>
    ${statBlock}
    <p style="color:#8892aa;margin:0 0 28px;line-height:1.6;">
      Your profile is still live. Pro gets you ranked higher, seen in more places, and lets you message coaches directly.
    </p>
    <a href="${rejoinUrl}" style="display:block;padding:14px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;text-align:center;">Rejoin Pro — £6.99/month</a>
    <p style="color:#8892aa;margin:20px 0 0;font-size:13px;line-height:1.6;">Questions? Just reply to this email.</p>
  `, unsubscribeUrl)

  await send({ to, subject: "Coaches are still recruiting — come back", html, tags: [{ name: 'flow', value: 'winback' }], isTest })
}

// ─── Shortlisted player became available (coach) ────────────────────────────

export async function sendShortlistAvailableEmail({
  to,
  coachName,
  playerName,
  playerId,
}: {
  to: string
  coachName: string | null
  playerName: string
  playerId: string
}) {
  const profileUrl = `${SITE}/dashboard/player/players/${playerId}?compose=1`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${coachName?.split(' ')[0] ?? 'Coach'},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      <strong style="color:#e8dece;">${playerName}</strong> — a player on your shortlist — is now a <strong style="color:#60a5fa;">free agent</strong> and available.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;font-size:13px;line-height:1.6;">
      Get in touch before another coach does.
    </p>
    <a href="${profileUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View Player &amp; Send Message</a>
  `, makeUnsubscribeUrl(playerId))

  await send({ to, subject: `${playerName} on your shortlist is now available`, html, tags: [{ name: 'flow', value: 'shortlist_available' }] })
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

  await send({ to, subject: `New application: ${opportunityTitle}`, html, tags: [{ name: 'flow', value: 'application_received' }] })
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
  const profileUrl = `${SITE}/dashboard/player/players/${p.id}?compose=1`
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

// ─── Player onboarding: Step 10 — Day 0 — Welcome ────────────────────────────
// Fires at approval. No stat — this is pure welcome, single CTA.
// No unsubscribe link: welcome email, not a marketing nudge.
export async function sendPlayerOnboardingD0Email({
  to,
  firstName: firstNameParam,
  isTest,
}: {
  to: string
  firstName: string | null
  isTest?: boolean
}) {
  const profileUrl = `${SITE}/dashboard/player/profile`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstNameParam ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      You're approved. Coaches across non-league football are already on here looking for players like you.
    </p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      The most important thing you can do right now: add your playing history. Every club you've played for, every level, every season. It's the first thing coaches look at to understand where you've been and whether you're right for their club.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Once that's in, fill out the rest — position, stats, highlight video if you've got one. The more complete it is, the more seriously coaches take it.
    </p>
    <a href="${profileUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Add your playing history</a>
  `)
  await send({ to, subject: "You're in. Welcome to NEXT11VEN ⚡", html, tags: [{ name: 'flow', value: 'player_onboarding_d0' }], isTest })
}

// ─── Player onboarding: Step 11 — Day 1 — Profile completion nudge ───────────
// profileComplete: true if the player has filled in at least 10 of the 13
// scored profile fields (avatar_url, position, club, city, status, phone,
// date_of_birth, foot, height, playing_level, highlight_urls, bio, season stats).
// Copy and CTA branch on this — complete profiles get validation,
// incomplete profiles get a direct prompt to finish.
export async function sendPlayerOnboardingD1Email({
  to,
  firstName: firstNameParam,
  playerId,
  missingFields,
  isTest,
}: {
  to: string
  firstName: string | null
  playerId: string
  /** Ranked missing profile fields from calcCompletion — top 5 max. Empty = profile complete. */
  missingFields: Array<{ label: string; why: string }>
  isTest?: boolean
}) {
  const profileUrl = `${SITE}/dashboard/player/profile`
  const isComplete = missingFields.length === 0
  const ctaLabel = isComplete ? 'View your public profile' : 'Finish your profile'

  const missingList = isComplete
    ? `<p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">Yours looks solid — coaches searching your position will see it.</p>`
    : `<p style="color:#8892aa;margin:0 0 12px;line-height:1.6;">Here's what yours is still missing, in order of what coaches notice first:</p>
       <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
         ${missingFields.map((f, i) => `
           <tr>
             <td style="padding:10px 12px;border-top:${i === 0 ? 'none' : '1px solid #1e2235'};vertical-align:top;width:1%;white-space:nowrap;">
               <span style="display:inline-block;width:20px;height:20px;border-radius:50%;background:#1a1f3a;border:1px solid #2a3150;text-align:center;line-height:20px;font-size:11px;font-weight:700;color:#4d8ae8;">${i + 1}</span>
             </td>
             <td style="padding:10px 12px;border-top:${i === 0 ? 'none' : '1px solid #1e2235'};">
               <p style="color:#e8dece;font-weight:600;font-size:13px;margin:0 0 2px;">${f.label}</p>
               <p style="color:#8892aa;font-size:12px;margin:0;line-height:1.5;">${f.why}</p>
             </td>
           </tr>`).join('')}
       </table>`

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstNameParam ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      Your career record — every club, every level — is the first thing coaches look at to understand where you've been and whether you're right for their club. If it's not on your profile yet, that's the single most important thing to add.
    </p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      After that, a highlight video goes a long way — coaches want to see you play before they reach out.
    </p>
    ${missingList}
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      One more thing worth knowing: Pro members can switch on <strong style="color:#e8dece;">Actively Looking</strong> — it puts your profile in a dedicated carousel coaches see every time they open the app, and ranks you higher in their searches. It's the difference between waiting to be found and putting yourself in front of them.
    </p>
    <a href="${profileUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">${ctaLabel}</a>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject: "Your profile is live — here's how to make coaches stop scrolling", html, tags: [{ name: 'flow', value: 'player_onboarding_d1' }], isTest })
}

// ─── Player onboarding: Step 12 — Day 3 — Coaches are here ──────────────────
// approvedCoachCount: standing COUNT of all approved coaches on the platform
// (all-time, not windowed — monotonically grows, never looks bad).
export async function sendPlayerOnboardingD3Email({
  to,
  firstName: firstNameParam,
  playerId,
  approvedCoachCount,
  isTest,
}: {
  to: string
  firstName: string | null
  playerId: string
  approvedCoachCount: number
  isTest?: boolean
}) {
  const oppsUrl = `${SITE}/dashboard/opportunities`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstNameParam ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      ${approvedCoachCount} clubs are actively using NEXT11VEN to find players right now — from National League (Step 2) down to regional leagues (Step 7 and below).
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Some post opportunities you can apply to directly. Others message players they've spotted without posting anything first — so a complete profile matters even when there's no open role listed yet.
    </p>
    <a href="${oppsUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Browse open opportunities</a>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject: 'Coaches across non-league football are already searching NEXT11VEN', html, tags: [{ name: 'flow', value: 'player_onboarding_d3' }], isTest })
}

// ─── Player onboarding: Step 13 — Day 7 — Premium pitch ─────────────────────
// openRoleCount: active opportunities matching the player's position + region.
// statAvailable: caller sets this to false when openRoleCount < 3 — the floor
// prevents a deflating "2 roles" from being shown. Fallback copy is still true.
// position: the player's position string (e.g. "Striker"), used in subject line.
export async function sendPlayerOnboardingD7Email({
  to,
  firstName: firstNameParam,
  playerId,
  openRoleCount,
  statAvailable,
  position,
  isTest,
}: {
  to: string
  firstName: string | null
  playerId: string
  openRoleCount: number
  statAvailable: boolean
  position: string | null
  isTest?: boolean
}) {
  const upgradeUrl = `${SITE}/dashboard/player/premium`
  const subject = statAvailable && position && openRoleCount > 0
    ? `${openRoleCount} open ${position} ${openRoleCount === 1 ? 'role' : 'roles'} ${openRoleCount === 1 ? 'is' : 'are'} live right now`
    : 'New roles are being posted on NEXT11VEN every week'

  const statBlock = statAvailable && openRoleCount > 0
    ? `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
        <p style="color:#4d8ae8;font-weight:700;font-size:32px;margin:0 0 4px;line-height:1;">${openRoleCount}</p>
        <p style="color:#8892aa;font-size:13px;margin:0;">open ${position ? position.toLowerCase() : ''} ${openRoleCount === 1 ? 'role' : 'roles'} live right now</p>
      </div>`
    : ''

  const roleLine = statAvailable && openRoleCount > 0
    ? `Right now there ${openRoleCount === 1 ? 'is' : 'are'} ${openRoleCount} open ${position ? position.toLowerCase() : ''} ${openRoleCount === 1 ? 'role' : 'roles'} live for your region.`
    : "New roles go up every week — Premium means you're never behind on them."

  const positionLabel = position ? position.toLowerCase() : ''
  const openingLine = statAvailable && openRoleCount > 0
    ? `Your profile's been live a week. There ${openRoleCount === 1 ? 'is' : 'are'} ${openRoleCount} open ${positionLabel} ${openRoleCount === 1 ? 'role' : 'roles'} live for your area right now. Here's what Pro gets you.`
    : "Your profile's been live a week and roles are going up every week. Here's what Pro gets you."

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstNameParam ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      ${openingLine}
    </p>
    ${statBlock}

    <div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;overflow:hidden;margin:0 0 8px;">
      <div style="padding:16px 20px;">
        <p style="color:#e8dece;font-weight:700;font-size:14px;margin:0 0 4px;">Get spotted by more coaches</p>
        <p style="color:#8892aa;font-size:13px;margin:0;line-height:1.5;">Switch on Actively Looking and appear in the carousel and free-agent searches coaches run first. Pro players get 3× more coach views on average.</p>
      </div>
    </div>

    <div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;overflow:hidden;margin:0 0 8px;">
      <div style="padding:16px 20px;">
        <p style="color:#e8dece;font-weight:700;font-size:14px;margin:0 0 4px;">Read and reply to coach messages</p>
        <p style="color:#8892aa;font-size:13px;margin:0;line-height:1.5;">Read every message coaches send you, plus 3 direct intros to coaches a month. If a coach doesn't reply within 14 days, you get the intro back.</p>
      </div>
    </div>

    <div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;overflow:hidden;margin:0 0 8px;">
      <div style="padding:16px 20px;">
        <p style="color:#e8dece;font-weight:700;font-size:14px;margin:0 0 4px;">See who's viewed and shortlisted you</p>
        <p style="color:#8892aa;font-size:13px;margin:0;line-height:1.5;">Know which coaches have viewed your profile and which saved you to a shortlist — the strongest signal a coach is serious about you.</p>
      </div>
    </div>

    <div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;overflow:hidden;margin:0 0 24px;">
      <div style="padding:16px 20px;">
        <p style="color:#e8dece;font-weight:700;font-size:14px;margin:0 0 4px;">Rank above free players in coach searches</p>
        <p style="color:#8892aa;font-size:13px;margin:0;line-height:1.5;">When coaches browse players, Pro profiles appear first. More visibility means more chances of getting the message that changes your season.</p>
      </div>
    </div>

    <p style="color:#8892aa;font-size:12px;margin:0 0 16px;text-align:center;">£6.99/mo — about £1.60 a week</p>
    <a href="${upgradeUrl}" style="display:block;padding:14px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;text-align:center;">Go Pro</a>
  `, makeUnsubscribeUrl(playerId))
  await send({ to, subject, html, tags: [{ name: 'flow', value: 'player_onboarding_d7' }], isTest })
}

// ─── Coach onboarding: Step 14 — Day 0 — Welcome ─────────────────────────────
// activePlayerCount: standing COUNT of all approved players on the platform.
// No unsubscribe link: welcome email, not a marketing nudge.
export async function sendCoachOnboardingD0Email({
  to,
  coachName,
  activePlayerCount,
  isTest,
}: {
  to: string
  coachName: string | null
  activePlayerCount: number
  isTest?: boolean
}) {
  const postUrl = `${SITE}/dashboard/opportunities?tab=mine`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(coachName)},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      You're approved. ${activePlayerCount} players are already using NEXT11VEN to get seen by clubs like yours.
    </p>
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      First step: post your first opportunity. It takes two minutes, and it's the thing that puts you in front of them.
    </p>
    <a href="${postUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Post an opportunity</a>
  `)
  await send({ to, subject: "You're in. Welcome to NEXT11VEN ⚡", html, tags: [{ name: 'flow', value: 'coach_onboarding_d0' }], isTest })
}

// ─── Coach onboarding: Step 15 — Day 2 — Post your first role ────────────────
// regionalPlayerCount: standing count of approved players in the coach's city.
// statAvailable: caller sets false when regionalPlayerCount < 3 — floor prevents
// "2 players in [city]" from showing. Fallback uses platform-wide framing.
// regionLabel: the coach's city string, or null if not set.
export async function sendCoachOnboardingD2Email({
  to,
  coachName,
  coachId,
  regionalPlayerCount,
  statAvailable,
  regionLabel,
  isTest,
}: {
  to: string
  coachName: string | null
  coachId: string
  regionalPlayerCount: number
  statAvailable: boolean
  regionLabel: string | null
  isTest?: boolean
}) {
  const postUrl = `${SITE}/dashboard/opportunities?tab=mine`
  const unsubscribeUrl = makeUnsubscribeUrl(coachId)

  const subject = statAvailable && regionLabel && regionalPlayerCount > 0
    ? `${regionalPlayerCount} players in ${regionLabel} are looking for a club`
    : 'Players near you are looking for a club right now'

  const statBlock = statAvailable && regionalPlayerCount > 0
    ? `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
        <p style="color:#4d8ae8;font-weight:700;font-size:32px;margin:0 0 4px;line-height:1;">${regionalPlayerCount}</p>
        <p style="color:#8892aa;font-size:13px;margin:0;">players in ${regionLabel} with live profiles, ready to apply</p>
      </div>`
    : ''

  const poolLine = statAvailable && regionalPlayerCount > 0
    ? `${regionalPlayerCount} players in ${regionLabel} with live profiles, ready to apply.`
    : 'a growing pool of players with live profiles, ready to apply.'

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(coachName)},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      You haven't posted an opportunity yet — here's what you're not seeing without one: ${poolLine}
    </p>
    ${statBlock}
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Posting takes two minutes and puts your club in front of them immediately.
    </p>
    <a href="${postUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Post your first opportunity</a>
  `, unsubscribeUrl)
  await send({ to, subject, html, tags: [{ name: 'flow', value: 'coach_onboarding_d2' }], isTest })
}

// ─── Coach onboarding: Step 16 — Day 5 — Proof / credibility ─────────────────
// recruitingCoachCount: coaches with an active opportunity OR a message sent to
// a player in the last 30 days (a blended "recruiting activity" stat).
// statAvailable: caller sets false when recruitingCoachCount < 5.
// Fallback: fallbackOpportunityCount (cumulative all-time opportunity count —
// monotonically growing, always a reasonable number to show).
export async function sendCoachOnboardingD5Email({
  to,
  coachName,
  coachId,
  recruitingCoachCount,
  statAvailable,
  fallbackOpportunityCount,
  isTest,
}: {
  to: string
  coachName: string | null
  coachId: string
  recruitingCoachCount: number
  statAvailable: boolean
  fallbackOpportunityCount: number
  isTest?: boolean
}) {
  const postUrl = `${SITE}/dashboard/opportunities?tab=mine`
  const unsubscribeUrl = makeUnsubscribeUrl(coachId)

  const subject = statAvailable
    ? `${recruitingCoachCount} clubs are actively recruiting on NEXT11VEN right now`
    : `Clubs have posted ${fallbackOpportunityCount} opportunities on NEXT11VEN since launch`

  const statBlock = statAvailable
    ? `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
        <p style="color:#4d8ae8;font-weight:700;font-size:32px;margin:0 0 4px;line-height:1;">${recruitingCoachCount}</p>
        <p style="color:#8892aa;font-size:13px;margin:0;">clubs actively recruiting on NEXT11VEN right now</p>
      </div>`
    : `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">
        <p style="color:#4d8ae8;font-weight:700;font-size:32px;margin:0 0 4px;line-height:1;">${fallbackOpportunityCount}</p>
        <p style="color:#8892aa;font-size:13px;margin:0;">opportunities posted on NEXT11VEN since launch</p>
      </div>`

  const bodyLine = statAvailable
    ? `You're not the only one deciding whether this is worth your time. ${recruitingCoachCount} clubs are actively recruiting on NEXT11VEN right now — posting opportunities, messaging players directly, or both.`
    : `You're not the only one deciding whether this is worth your time. Clubs have posted ${fallbackOpportunityCount} opportunities on NEXT11VEN since launch — and the players are here for them.`

  const proUrl = `${SITE}/dashboard/coach/premium`
  const performanceUrl = `${SITE}/dashboard/coach/performance`

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(coachName)},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      ${bodyLine}
    </p>
    ${statBlock}
    <p style="color:#8892aa;margin:0 0 24px;line-height:1.6;">
      Yours could be one of them in under two minutes.
    </p>
    <a href="${postUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Post an opportunity</a>

    <div style="margin:28px 0 0;padding-top:24px;border-top:1px solid #1e2235;">
      <p style="color:#e8dece;font-weight:700;font-size:14px;margin:0 0 8px;">Want to go further? Coach Pro lets you recruit by stats.</p>
      <p style="color:#8892aa;font-size:13px;margin:0 0 16px;line-height:1.6;">Instead of browsing profiles one by one, the Coach Pro performance dashboard lets you filter every consenting player on the platform by their actual numbers — goals, appearances, minutes played. Find players who fit your standard without the guesswork.</p>
      <a href="${performanceUrl}" style="display:inline-block;padding:10px 20px;background:transparent;color:#4d8ae8;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;border:1px solid #2a3150;">Explore the performance dashboard</a>
    </div>
  `, unsubscribeUrl)
  await send({ to, subject, html, tags: [{ name: 'flow', value: 'coach_onboarding_d5' }], isTest })
}

// ─── Premium welcome: Step 20 — Player Pro ───────────────────────────────────
// Transactional confirmation — no unsubscribe link, no stat.
export async function sendPlayerProWelcomeEmail({
  to,
  firstName: firstNameParam,
  isTest,
}: {
  to: string
  firstName: string | null
  isTest?: boolean
}) {
  const profileUrl = `${SITE}/dashboard/player/profile`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstNameParam ?? 'there'},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      You're now ranked higher in searches, visible in more places, and you can apply to roles and message coaches directly. That's the whole unlock — no extra setup needed.
    </p>
    <a href="${profileUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View your profile</a>
  `)
  await send({ to, subject: "You're Premium. Here's what just changed.", html, tags: [{ name: 'flow', value: 'player_pro_welcome' }], isTest })
}

// ─── Premium welcome: Step 21 — Coach Pro ────────────────────────────────────
// Closes the "Coach Pro upgrade confirmation email" gap in TOUCHPOINTS.md.
// Transactional confirmation — no unsubscribe link, no stat.
export async function sendCoachProWelcomeEmail({
  to,
  coachName,
  isTest,
}: {
  to: string
  coachName: string | null
  isTest?: boolean
}) {
  const searchUrl = `${SITE}/dashboard/coach/players`
  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(coachName)},</p>
    <p style="color:#8892aa;margin:0 0 16px;line-height:1.6;">
      You can now search the full player database, message players directly, and get notified the moment a matching profile joins. Nothing else to set up.
    </p>
    <a href="${searchUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Search players</a>
  `)
  await send({ to, subject: "You're Coach Pro. Here's what just unlocked.", html, tags: [{ name: 'flow', value: 'coach_pro_welcome' }], isTest })
}

export async function sendCoachRecommendationsEmail({
  to,
  coachId,
  coachName,
  players,
  personalised,
}: {
  to: string
  coachId: string
  coachName: string | null
  players: RecommendationEmailPlayer[]
  // true when the picks are driven by the coach's search history;
  // false for cold coaches — the copy must stay honest about which it is.
  personalised: boolean
}) {
  const count = players.length
  const intro = personalised
    ? `Based on the players you've been looking at, here ${count === 1 ? 'is one player' : `are ${count} players`} we think ${count === 1 ? 'is' : 'are'} worth a closer look this week.`
    : `Here ${count === 1 ? 'is a player' : 'are some players'} we think suit your level and area.`
  const footnote = personalised
    ? `These picks come from your search activity on NEXT11VEN — the more you browse, the sharper they get.`
    : `These picks get sharper the more you search and browse players on NEXT11VEN.`

  const html = baseTemplate(`
    <p style="color:#e8dece;margin:0 0 12px;">Hi ${firstName(coachName)},</p>
    <p style="color:#8892aa;margin:0 0 20px;line-height:1.6;">
      ${intro}
    </p>
    ${players.map(recommendationCard).join('')}
    <p style="color:#8892aa;margin:16px 0 0;font-size:12px;line-height:1.6;">
      ${footnote}
    </p>
    <p style="margin:10px 0 0;font-size:11px;">
      <a href="${makeUnsubscribeUrl(coachId)}" style="color:#4b5563;">Stop these weekly player tips</a>
    </p>
  `)

  await send({
    to,
    subject:
      count === 1
        ? `A player we think you'd want to know about`
        : `${count} players we think you'd want to know about`,
    html,
    tags: [{ name: 'flow', value: 'coach_recommendations' }],
  })
}
