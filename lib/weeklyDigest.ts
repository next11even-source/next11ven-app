// ─── Weekly digest — pure compute + render ────────────────────────────────────
//
// Builds the weekly player digest email body. NO database, NO network — every
// block is computed here from data the cron has already fetched, so the whole
// thing is deterministic and testable, and a bad render throws (assertClean)
// instead of mailing a broken/negative email.
//
// Positivity guarantee: block 4 ('Your move') ALWAYS renders, so the email is
// never empty and never shows a deflating "0". Platform stats (block 1) only
// appear when a number clears its credibility floor — below that the whole block
// is omitted rather than padded with filler (the platform is still ~10% activated
// — never print "2 coaches active", and never a content-free "coaches were active").

import { positionCategory, type PositionCategory } from '@/lib/positions'
import { calcCompletion, type CompletionProfile } from '@/lib/profileCompletion'
import { PROOF_LINE, PREMIUM_PRICE_PER_MONTH } from '@/lib/premiumContent'

// ── Credibility floors ────────────────────────────────────────────────────────
// Below these, we never print the raw number — we swap to qualitative copy (or
// omit the line). Tuned for a small, still-activating platform.
const OPPS_NUMBER_FLOOR = 5      // "N new opportunities" only when N >= 5
const COACHES_NUMBER_FLOOR = 10  // "N coaches active" only when N >= 10
const NEAR_YOU_FLOOR = 2         // "Roles for you" block only when >= 2

export type DigestPlayer = CompletionProfile & {
  id: string
  email: string | null
  full_name: string | null
  premium: boolean
  position: string | null
}

export type DigestPlatform = {
  newOpps: number
  // coaches who signed in within the last 30 days (auth last_sign_in_at)
  activeCoachesMonth: number
  // live (is_active) opportunity counts bucketed by position category
  oppsByCategory: Record<string, number>
}

export type DigestCoachView = { full_name: string | null; club: string | null }

export type DigestInput = {
  player: DigestPlayer
  platform: DigestPlatform
  coachViews: DigestCoachView[] // this player's coach viewers, already deduped
  site: string
  // true when the player has never set a password / entered the app
  // (password_set_at IS NULL) — shows a claim-your-account banner up top.
  unclaimed: boolean
}

function firstName(name: string | null): string {
  if (!name) return 'there'
  return name.trim().split(/\s+/)[0] || 'there'
}

// User-supplied strings (names, clubs) are interpolated into HTML — escape them
// so a stray <, &, or quote can't mangle a row or inject markup.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function section(heading: string, body: string): string {
  return `<div>
    <p style="margin:0 0 12px;font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#e8dece;">${heading}</p>
    ${body}
  </div>`
}

function divider(): string {
  return `<div style="height:1px;background:#1e2235;margin:24px 0;"></div>`
}

// Self-serve /claim page (pre-filled email) which issues its own magic link, so
// buttons never dead-end on a missing token.
function makeClaimUrl(email: string | null, site: string): string {
  return `${site}/claim${email ? `?email=${encodeURIComponent(email)}` : ''}`
}

// Claim-your-account banner — only for players who've never entered the app.
function claimBanner(email: string | null, site: string): string {
  const claimUrl = makeClaimUrl(email, site)
  return `<div style="background:rgba(45,95,196,0.12);border:1px solid #2d5fc4;border-radius:12px;padding:18px 20px;margin:0 0 22px;">
    <p style="margin:0 0 6px;color:#fff;font-size:15px;font-weight:700;">Your account is ready &mdash; claim it</p>
    <p style="margin:0 0 14px;color:#cdd5e6;font-size:13px;line-height:1.6;">You haven&rsquo;t set your password yet. Claim your NEXT11VEN account to reply to coaches, see who&rsquo;s viewing you and manage your profile.</p>
    <a href="${claimUrl}" style="display:inline-block;padding:12px 24px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Claim your account</a>
  </div>`
}

function statLine(text: string): string {
  return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;">
    <div style="width:6px;height:6px;border-radius:50%;background:#2d5fc4;margin-top:7px;flex-shrink:0;"></div>
    <span style="color:#e8dece;font-size:14px;line-height:1.5;">${text}</span>
  </div>`
}

// ── Block 1: This week on NEXT11VEN (always renders) ─────────────────────────

function block1(p: DigestPlatform): string {
  const lines: string[] = []

  // Lead with the always-on activity signal — coaches signed in this month.
  if (p.activeCoachesMonth >= COACHES_NUMBER_FLOOR) {
    lines.push(statLine(`<strong style="color:#fff;">${p.activeCoachesMonth} coaches</strong> have been active this month`))
  }
  if (p.newOpps >= OPPS_NUMBER_FLOOR) {
    lines.push(statLine(`<strong style="color:#fff;">${p.newOpps} new opportunities</strong> were posted this week`))
  }

  // Only worth a section when there's a real number to show. Below the floors,
  // omit the whole block rather than pad it with filler. (Block 4 'Your move'
  // always renders, so the email is never empty.)
  if (lines.length === 0) return ''

  return section(
    'On NEXT11VEN',
    `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:8px 18px;">${lines.join('')}</div>`
  )
}

// ── Block 2: Roles for you (only when >= NEAR_YOU_FLOOR) ──────────────────────

function block2(count: number, category: PositionCategory | null, site: string, overrideCta: string | null): string {
  if (count < NEAR_YOU_FLOOR) return ''
  const catLabel = category ?? 'your position'
  const url = overrideCta ?? `${site}/dashboard/opportunities`
  return section(
    'Roles for you',
    `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:18px 20px;">
      <p style="margin:0 0 4px;color:#e8dece;font-size:15px;line-height:1.5;">
        <strong style="color:#fff;">${count} live roles</strong> for ${catLabel} right now.
      </p>
      <p style="margin:0 0 14px;color:#8892aa;font-size:13px;line-height:1.5;">Get your application in while they're open.</p>
      <a href="${url}" style="display:inline-block;padding:11px 22px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Browse open roles</a>
    </div>`
  )
}

// ── Block 3: Your week — profile views (omitted when 0) ───────────────────────

function block3(player: DigestPlayer, coachViews: DigestCoachView[], site: string, overrideCta: string | null): string {
  const coachCount = coachViews.length
  if (coachCount < 1) return '' // never render a "0 views" block

  if (player.premium) {
    const list = coachViews
      .map(c => {
        // Premium pay-to-see-clubs reveal: every row must read complete. A missing
        // club is unset data, not a paywall — fall back to the one thing always
        // true ("Coach") so the list never looks half-populated.
        const primary = escapeHtml(c.full_name?.trim() || 'A coach')
        const secondary = escapeHtml(c.club?.trim() || 'Coach')
        const label = `${primary} &mdash; ${secondary}`
        return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #1e2235;">
          <div style="width:8px;height:8px;border-radius:50%;background:#a78bfa;flex-shrink:0;"></div>
          <span style="color:#e8dece;font-size:14px;">${label}</span>
        </div>`
      })
      .join('')
    const url = overrideCta ?? `${site}/dashboard/player/activity/profile-views`
    return section(
      'Your week',
      `<p style="margin:0 0 14px;color:#8892aa;font-size:14px;line-height:1.6;">
        <strong style="color:#e8dece;">${coachCount} coach${coachCount === 1 ? '' : 'es'}</strong> viewed your profile in the last 7 days:
      </p>
      <div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:4px 20px;margin:0 0 14px;">${list}</div>
      <a href="${url}" style="display:inline-block;padding:11px 22px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">View your activity</a>`
    )
  }

  // Free — count + upgrade CTA (who is hidden behind premium).
  const url = overrideCta ?? `${site}/dashboard/player/premium`
  return section(
    'Your week',
    `<div style="text-align:center;padding:8px 0 16px;">
      <p style="font-size:56px;font-weight:900;color:#e8dece;margin:0;line-height:1;font-family:Arial,sans-serif;">${coachCount}</p>
      <p style="font-size:14px;font-weight:700;color:#8892aa;margin:8px 0 0;letter-spacing:0.03em;text-transform:uppercase;">coach${coachCount === 1 ? '' : 'es'} viewed you this week</p>
    </div>
    <p style="margin:0 0 16px;color:#8892aa;font-size:14px;line-height:1.6;text-align:center;">Upgrade to Premium to see exactly who&rsquo;s been looking &mdash; and get in front of them first.</p>
    <div style="text-align:center;">
      <a href="${url}" style="display:inline-block;padding:13px 30px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:15px;">See who viewed you</a>
    </div>`
  )
}

// ── Block 4: Your move (always renders — the forward action) ──────────────────

function block4(player: DigestPlayer, pct: number, missing: string[], site: string, newOpps: number, overrideCta: string | null): string {
  // 1) Incomplete profile — highest-leverage nudge, framed positively.
  if (pct < 100 && missing.length > 0) {
    const detail =
      missing.length === 1
        ? `the last detail`
        : `a few details (${missing.slice(0, 3).join(', ')})`
    const url = overrideCta ?? `${site}/dashboard/player/profile`
    return section(
      'Your move',
      `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:18px 20px;">
        <p style="margin:0 0 6px;color:#e8dece;font-size:15px;line-height:1.5;">Your profile is <strong style="color:#fff;">${pct}% complete</strong>.</p>
        <p style="margin:0 0 14px;color:#8892aa;font-size:13px;line-height:1.6;">Coaches skim fast &mdash; finishing ${detail} makes them stop on you.</p>
        <a href="${url}" style="display:inline-block;padding:11px 22px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Finish your profile</a>
      </div>`
    )
  }

  // 2) Complete but free — pay to be found.
  if (!player.premium) {
    const url = overrideCta ?? `${site}/dashboard/player/premium`
    return section(
      'Your move',
      `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:18px 20px;">
        <p style="margin:0 0 14px;color:#e8dece;font-size:15px;line-height:1.6;">${PROOF_LINE}</p>
        <a href="${url}" style="display:inline-block;padding:11px 22px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">Get discovered &mdash; ${PREMIUM_PRICE_PER_MONTH}</a>
      </div>`
    )
  }

  // 3) Premium + complete — keep them active. The CTA must survive the click, so
  // only promise "new roles" when there genuinely are some this week; otherwise
  // point at the player's own profile, which is never empty.
  const hasFreshRoles = newOpps >= OPPS_NUMBER_FLOOR
  const copy = hasFreshRoles
    ? `You&rsquo;re all set &mdash; and fresh roles went up this week. Get in early.`
    : `You&rsquo;re all set. Keep your highlights fresh so coaches see your best when they land on you.`
  const ctaLabel = hasFreshRoles ? `See this week&rsquo;s roles` : `Refresh your highlights`
  const url = overrideCta ?? (hasFreshRoles ? `${site}/dashboard/opportunities` : `${site}/dashboard/player/profile`)
  return section(
    'Your move',
    `<div style="background:#0d1020;border:1px solid #1e2235;border-radius:12px;padding:18px 20px;">
      <p style="margin:0 0 14px;color:#e8dece;font-size:15px;line-height:1.6;">${copy}</p>
      <a href="${url}" style="display:inline-block;padding:11px 22px;background:#2d5fc4;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">${ctaLabel}</a>
    </div>`
  )
}

// ── Subject line (never negative) ─────────────────────────────────────────────

function buildSubject(args: { coachCount: number; nearYouCount: number; newOpps: number }): string {
  const { coachCount, nearYouCount, newOpps } = args
  if (coachCount >= 1) return `${coachCount} coach${coachCount === 1 ? '' : 'es'} viewed you this week`
  if (nearYouCount >= NEAR_YOU_FLOOR) return `${nearYouCount} new roles match your position`
  if (newOpps >= OPPS_NUMBER_FLOOR) return `${newOpps} new opportunities on NEXT11VEN this week`
  return `Your week on NEXT11VEN`
}

// ── assertClean — fail the render rather than mail garbage ────────────────────

const BANNED: RegExp[] = [
  /undefined/i,
  /\bnull\b/i,
  /NaN/,
  /\bInfinity\b/,
  /\{\$/, // stray merge-field syntax
  /\b0 (coach|coaches|opportunit|role|roles|view|views)/i,
  /\bno (coaches|views|opportunit)/i,
]

function assertClean(subject: string, html: string): void {
  const hay = `${subject}\n${html}`
  for (const re of BANNED) {
    if (re.test(hay)) throw new Error(`weeklyDigest: banned token ${re} in output`)
  }
  if (!html.trim()) throw new Error('weeklyDigest: empty content')
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function buildWeeklyDigest(input: DigestInput): { subject: string; contentHtml: string } {
  const { player, platform, coachViews, site } = input

  const coachCount = coachViews.length
  const category = positionCategory(player.position)
  const nearYouCount = category ? platform.oppsByCategory[category] ?? 0 : 0
  const { pct, missing } = calcCompletion(player)

  // Unclaimed players can't reach any in-app page (they've no password), so every
  // CTA funnels to /claim — one coherent action, no sign-in dead-ends.
  const overrideCta = input.unclaimed ? makeClaimUrl(player.email, site) : null

  // Scent match: lead the body with the block the subject line promised, so the
  // reader sees what they opened for first. 'Your move' is always the closer.
  const parts: Record<'week' | 'platform' | 'roles', string> = {
    week: block3(player, coachViews, site, overrideCta),
    platform: block1(platform),
    roles: block2(nearYouCount, category, site, overrideCta),
  }

  let order: Array<'week' | 'platform' | 'roles'>
  if (coachCount >= 1) {
    order = ['week', 'platform', 'roles'] // subject sells the view count → lead with it
  } else if (nearYouCount >= NEAR_YOU_FLOOR) {
    order = ['roles', 'platform', 'week'] // subject sells position-matched roles
  } else {
    order = ['platform', 'roles', 'week']
  }

  const body = order.map(k => parts[k]).filter(Boolean)
  const blocks = [...body, block4(player, pct, missing, site, platform.newOpps, overrideCta)]

  const greeting = `<p style="color:#e8dece;margin:0 0 20px;font-size:16px;">Hi ${escapeHtml(firstName(player.full_name))},</p>`
  const claim = input.unclaimed ? claimBanner(player.email, site) : ''
  const contentHtml = greeting + claim + blocks.join(divider())

  const subject = buildSubject({ coachCount, nearYouCount, newOpps: platform.newOpps })

  assertClean(subject, contentHtml)
  return { subject, contentHtml }
}
