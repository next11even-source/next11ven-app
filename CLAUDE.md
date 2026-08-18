NEXT11VEN — Claude Code Context

What this is
Custom non-league football recruitment platform. Live at app.next11ven.com.
Glide is dead. Migration is complete. Focus is now usage, activation, and monetisation.
Solo founder build. Launched April 2026.
Stack
Next.js 16 (16.1.6) App Router, React 19, TypeScript, Tailwind CSS v4, Supabase (PostgreSQL + Auth + Storage),
Stripe, Twilio, Resend, MailerLite, Telegram (metrics), Vercel (production at app.next11ven.com)
Build uses Webpack (`next build --webpack`), not Turbopack.
Brand & Style

Background: #0a0a0a — Surface: #13172a — Border: #1e2235
Primary blue: #2d5fc4 → #3a6fda hover
Cream text: #e8dece — Muted text: #8892aa
Headings: Barlow Condensed (bold, uppercase) — Body: Inter
Green (#22c55e) limited to: availability signals (Actively Looking dot/chip/toggle), positive confirmations, and positive movement/growth in analytics (this-period-vs-last-period increase, net new MRR ≥0, quick ratio ≥1 — see HeroRow.tsx UP_COLOR) — never for general UI otherwise. The analytics carve-out is deliberate (16 Aug 2026): growth needs to read as unambiguously good, and blue/amber alone didn't get there. Decline stays amber, not red — a dip on a solo founder's own dashboard doesn't need alarm-red.
Mobile-first. Dark theme throughout. No over-engineering.


Database
Single source of truth: profiles table.

⚠️ player_profiles and coach_profiles exist in Supabase but are ORPHANED — do not read or write to them, do not reference them


Role: 'player' | 'coach' | 'admin' | 'fan'
Fan accounts = browse-only. No posting, no messaging. Fans see a "Become a Player or Coach" banner on the player homepage and can self-convert via /dashboard/become (→ /api/account/convert); conversion is instant (keeps approved=true, no re-approval).
⚠️ FAN SIGNUP IS CLOSED (12 Aug 2026) — /register offers Player and Coach only, and /api/register/complete rejects role='fan' (allowedRoles = player, coach). Browse-only accounts earn nothing and cost bandwidth. Existing fans are untouched: they keep the role, keep browsing, and the /dashboard/become conversion path stays live. Do not re-add fan to the register role picker or to allowedRoles. 'fan' remains valid everywhere else (rescue-profile, admin role dropdown, set-password auto-approve, MailerLite labels) because existing fans still flow through those.
admin role also counts as a player — use .in('role', ['player', 'admin']) for player queries
Founder = the admin account (Jamal). isFounder(role) returns role === 'admin' — admin role doubles as the founder flag (app/components/FounderBadge.tsx is the single source of truth).
Agent = a coach row with is_agent = true (admin-toggled). Keeps every coach ability EXCEPT initiating a conversation with another coach (enforced in /api/messages/send). isAgent() in app/components/AgentBadge.tsx is the single source of truth.
approved: boolean — approval_status: text (pending | approved | declined)
premium: boolean — flipped by Stripe webhook
actively_looking: boolean — premium-only toggle for player visibility; NOT auto-enabled on upgrade (player must opt in); server-enforced (API rejects true for non-premium)
Status values: free_agent | signed | loan_dual_reg | just_exploring
⚠️ status is a profile display field only. The "Free Agents" filter and Actively Looking carousel use actively_looking, NOT status = 'free_agent'

Key columns:
id, email, full_name, role, approved, approval_status, position, secondary_position, club, avatar_url, status, premium, actively_looking, weekly_views, created_at, goals, assists, appearances, season, streak_weeks, streak_last_week, last_active, highlight_urls, date_of_birth, city, location, playing_level, foot, height, coaching_level, coaching_role, coaching_history, gdpr_consent, referral, phone, sms_opt_in, is_active, bio, updated_at, purchased_message_credits, showcase_confirmed, showcase_confirmed_at, email_marketing_opt_out, last_sms_at, is_agent

⚠️ conversations has COLUMN-LEVEL select grants, not a blanket table grant
(20260812000003). A newly added column is NOT readable by clients until it is
granted — symptom is a PostgREST 403 "permission denied for column" and an inbox
that won't load. Any migration adding a column here MUST follow it with:
    grant select (new_column) on public.conversations to anon, authenticated;
WHY it's like this: last_message_content caches a message body, and the earlier
attempt to withhold it (`revoke select (col)`, 20260628000001) silently did
nothing — Postgres sums privileges, so a column REVOKE can't subtract from
Supabase's table-level GRANT. A non-premium player could read the newest message
in every thread straight from PostgREST, defeating the read paywall. Dropping the
table grant and re-granting an explicit column list is the only mechanism Postgres
honours. Body reads go through conversation_previews() (security definer, enforces
the premium check), so they're unaffected. Never re-add a blanket grant here.

Active tables
profiles, conversations, messages, player_views, shortlist_alerts,
coach_saved_players, subscriptions, opportunities, applications, bookmarks,
highlights, notifications, partner_discounts, status_change_log, premium_clicks,
posts, post_likes, post_comments, post_interests,
player_message_quota, drip_jobs

⚠️ status_change_log and premium_clicks existed in the schema but were written
to by NOTHING (verified empty, 16 Aug 2026) until the analytics rebuild wired
them up same day: status_change_log now gets a row from every profiles.status
transition via trg_log_status_change (20260816000001), and premium_clicks now
gets a row every time a free user is shown (not just clicks) a premium paywall,
via POST /api/track/premium-intent — called from ActivelyLookingModal (all 3
variants) and LockedMessageTrigger. The Stripe webhook marks the touchpoints in
the preceding 7 days converted = true on that user's first premium activation.
Don't assume either table is populated before 16 Aug 2026 — there's no history
before that date, only forward accrual.

Orphaned — never use
player_profiles, coach_profiles, likes, profile_views
Confirmed empty + zero code references (16 Aug 2026). likes and profile_views
are superseded by post_likes and player_views respectively — don't resurrect
them, write to the live equivalents instead.

Auth & Middleware

Supabase auth via @supabase/ssr — email/password + magic link
Email confirmation disabled
middleware.ts protects all /dashboard/* routes
Role-based redirects: player / admin → /dashboard/player, coach → /dashboard/coach
Unapproved users → /pending
Admin users bypass all role checks in middleware
Magic link claim flow: /claim → /set-password — do not delete, some migrated users may still need these


Integrations
Stripe ✅ LIVE

Player Premium: £6.99/mo — Coach Pro: £9.99/mo
Extra Messages: one-time credit pack (5 credits) via /api/stripe/checkout/message-pack
Checkout: /api/stripe/checkout — Webhook: /api/stripe/webhook — Portal: /api/stripe/portal
Webhook handles: customer.subscription.created, customer.subscription.updated,
  invoice.payment_succeeded, checkout.session.completed (message_pack type),
  customer.subscription.deleted, invoice.payment_failed
Webhook flips premium on profiles + writes to subscriptions table + upserts player_message_quota
Premium synced on first dashboard login via /api/stripe/sync
Admin reconcile tool at /dashboard/admin for out-of-sync states

Twilio ✅ LIVE

SMS on admin approval + new messages + drip Day 7
Feature flagged: TWILIO_ENABLED in .env (set to 'false' to disable, any other value enables)
Rate limit: 1 SMS per recipient per day via last_sms_at on profiles (non-blocking)
sms_opt_in IS enforced — checked in admin/review, messages/send, and drip-reminders before every send
Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

Resend ✅ LIVE

Transactional + marketing emails via lib/email.ts (server-side only)
From: RESEND_FROM_EMAIL env var (defaults to NEXT11VEN <hello@next11ven.com>)
Feature flagged: RESEND_ENABLED in .env
Functions in lib/email.ts:
  sendMessageNotificationEmail — new message received
  sendApplicationDecisionEmail — coach accept/reject
  sendApplicationReceivedEmail — coach notified of new application
  sendExtraMessagesPurchaseEmail — message pack purchase confirmation
  sendDripDay0Email — coach messaged free player (upgrade to read)
  sendDripDay3Email — unread message reminder at 3 days
  sendDripDay7Email — final reminder at 7 days
  sendWeeklyDigestEmail — weekly player digest (body built + validated in lib/weeklyDigest.ts)
  sendPaymentFailedEmail — invoice.payment_failed notice
  sendPaymentFailedFollowUpEmail — payment-failed follow-up reminder
  sendSubscriptionCancelledWinBackEmail — win-back after subscription cancelled
  sendShortlistAvailableEmail — player notified a coach shortlisted them
  sendCoachRecommendationsEmail — weekly coach recommendation digest (recommendation engine)
  sendLogNudgeEmail — post-match "log your game" nudge (tracker flywheel intake; email fallback to SMS)
  sendApplicationNudgeEmail — coach nudge: players still awaiting an accept/reject
Env vars: RESEND_API_KEY, RESEND_FROM_EMAIL

MailerLite ✅ LIVE

Fires on admin approval and premium upgrade
Approved Players group: 181864482947991450
Approved Coaches group: 181864480498517498
Skips existing subscribers — no duplicate sequences
Tags: player_premium, coach_pro on upgrade
Feature flagged: MAILERLITE_ENABLED in .env
email_marketing_opt_out on profiles — drip sequence skips opted-out players; transactional emails are never suppressed

Telegram ✅ LIVE

Weekly metrics report pushed to a Telegram chat (lib/telegram.ts + lib/weeklyReport.ts)
Sent by /api/cron/weekly-metrics-telegram — Monday 08:00 UTC
Env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_REPORT_CHAT_ID (TELEGRAM_API base URL)

Coach Recommendation Engine ✅ LIVE

Weekly per-coach player recommendations (lib/recommendations.ts)
On-demand: GET /api/coach/recommendations — Cron: /api/cron/coach-recommendations (Tuesday 08:00 UTC)
Emails matched players via sendCoachRecommendationsEmail

Meta Pixel ✅ LIVE

Pixel ID: 943750121308525
Page view tracking injected globally

Vercel Analytics ✅ LIVE


Notification Triggers — FULL INVENTORY
Every outbound thing the platform can send. Keep this table in sync — if you add
a send site and don't list it here, the next person cannot answer "what does this
user actually receive?" without re-reading the whole codebase.

⚠️ THE RULE: before adding any send, ask what a user receives when the triggering
action happens TEN TIMES AT ONCE. If the answer is ten sends, it needs a cap, a
grouping, or a digest before it ships.

⚠️ THE DATABASE NEVER SENDS ANYTHING. No pg_net, no http extension, no webhooks
on any table. Triggers only INSERT into `notifications` (in-app only). Every
email and SMS is an explicit call in an API route. A notifications insert can
never fan out to email or SMS — do not introduce a DB-level sender.

EMAIL (Resend — all via lib/email.ts, RESEND_ENABLED flag)
Function                              Fired from                             Cap / guard
sendMessageNotificationEmail          /api/messages/send                     —
sendDripDay0Email                     /api/messages/send                     drip: aborts if read/premium/opt-out
sendDripDay3Email                     /api/cron/drip-reminders               as above
sendDripDay7Email                     /api/cron/drip-reminders               as above
sendApplicationReceivedEmail          /api/applications/apply                — (coach-facing)
sendApplicationDecisionEmail          /api/applications/[id]                 ACCEPT: always. DECLINE: 1/player/24h AND only if applied <42d ago
sendApplicationNudgeEmail             /api/cron/application-nudge            1 per coach per 5 days
sendLogNudgeEmail                     /api/cron/log-nudge                    SMS-first, email only as fallback
sendWeeklyDigestEmail                 /api/cron/weekly-digest                weekly, 1 per player
sendCoachRecommendationsEmail         /api/cron/coach-recommendations        weekly, 1 per coach
sendShortlistAvailableEmail           /api/player/status-change              1 per coach per player per week
sendPaymentFailedEmail                /api/stripe/webhook                    transactional
sendPaymentFailedFollowUpEmail        /api/cron/drip-reminders               transactional
sendSubscriptionCancelledWinBackEmail /api/cron/drip-reminders               once per cancellation
sendExtraMessagesPurchaseEmail        /api/stripe/webhook                    transactional
sendOpportunityAutoClosedEmail        /api/cron/opportunity-close            1 per coach per run, lists every role closed
Marketing sends respect email_marketing_opt_out. Transactional (payment failed,
application decisions) must NEVER be suppressed by it.

SMS (Twilio — inlined per route, no shared helper. TWILIO_ENABLED flag)
Six send sites, ALL gated on sms_opt_in AND the 1-per-recipient-per-day
last_sms_at cap:
  /api/messages/send             new message received
  /api/admin/review              approval decision
  /api/cron/application-nudge    coach sitting on unanswered applications
  /api/cron/drip-reminders       drip step 3 (Day 7) only
  /api/cron/log-nudge            post-match "log your game"
  /api/stripe/webhook            payment failed (handlePaymentFailedNotifications)
⚠️ NOTHING ELSE SENDS SMS. In particular application closure, application
declines, message credit refunds AND opportunity auto-closure are in-app (+
email for the last one) only — deliberately. Nobody gets texted that they were
rejected, that a coach ignored them, or that their own role was taken down. Do
not add SMS to any of them.
⚠️ application-nudge also carries the opportunity-auto-close PRE-WARNING (a
role nearing its 14-day neglect cutoff, see lib/opportunityLifecycle.ts) as an
extra line on its EXISTING send, never a separate message — and caps itself at
MAX_SMS_PER_RUN (40) total texts per run, falling back to email past the cap.
Deliberate: SMS here is for reach, not volume, and every enhancement to this
route should keep riding the one send rather than adding another.

IN-APP (notifications table — inserted by DB trigger or service-role API call)
Type                          Written by                                Recipient
post_like                     trigger trg_notify_post_like              post author
post_comment                  trigger trg_notify_post_comment           post author
post_interest                 trigger trg_notify_post_interest          post author
new_opportunity_application   trigger trg_notify_new_application        coach
shortlist_post                trigger trg_notify_shortlist_post         coach
shortlist_availability        triggers trg_notify_shortlist_availability
                              + trg_notify_viewed_player_free_agent     coach
shortlisted                   /api/coach/shortlist POST                 player
application_decision          /api/applications/[id]                    player — ACCEPTED ONLY
application_declined          /api/applications/[id]                    player — declined; grouped by day in UI
application_closed            /api/cron/application-close               player — 1 per player per run
                              + lib/opportunityClosure.ts                same type, fires immediately (not
                                                                          just the weekly sweep) the moment an
                                                                          opportunity closes — auto or manual
message_credit_refunded       /api/cron/message-credit-refund           player — 1 per player per run
opportunity_auto_closed       /api/cron/opportunity-close               coach — 1 per coach per run, also emailed
Enum also allows profile_view and new_opportunity: nothing writes either. Legacy.

⚠️ Accepts and declines are deliberately asymmetric and must stay that way. An
accept is the best thing that happens to a player here — individual row, always
emails, actor avatar shown, no matter how old the application. A decline is
information, not an event — no actor, muted icon, collapsed into one row per
day, email capped at one a day. Adding a new player-facing notification? Decide
which of those two it behaves like.

⚠️ COLOUR DOCTRINE for application outcomes (lib/applicationResponse.ts
PLAYER_APPLICATION_COPY + app/dashboard/player/activity/page.tsx TypeIcon):
grey (#8892aa) means a HUMAN made a call — `rejected` is the only state that
gets it. Amber (#f59e0b) means nobody did — `closed_no_response` and
`closed_role_gone` both use it, because a decline and a platform closure are
NOT the same thing and must never look the same: giving a system-manufactured
resolution the identical grey as a real rejection lets it masquerade as one,
which is exactly what the closed_at / status split exists to prevent (see
lib/applicationResponse.ts). Blue (#2d5fc4) stays exclusive to `accepted`.
Reuses the existing amber rather than a new shade — it's already this app's
"pending/attention" colour (see `waiting` above), and the label text carries
the actual disambiguation.

⚠️ STALE RESOLUTIONS RESOLVE QUIETLY. NOTIFY_RESOLUTION_WITHIN_DAYS (42) in
lib/applicationResponse.ts: a player who applied more than 6 weeks ago has moved
on, so a decline or a closure on it is not information — it's an excavation, and
it makes the platform the bearer of stale bad news. Those still resolve (card
updates, coach's backlog clears, history stays honest) but send NO email and NO
in-app notification. Nothing is hidden; it just isn't announced. Applies to
platform closure and to a coach's late decline. NOT to an acceptance — good news
never goes stale. As of 11 Aug 2026 this is the majority case, not the edge:
56 of 82 pending closures are past the window.
Renderers: app/dashboard/player/activity/page.tsx (getRoute + TypeIcon +
groupKey/groupMessage) and app/dashboard/coach/notifications/page.tsx. A type
with no case in getRoute routes users back to the page they're already on.

Live Automations
- Drip sequence: /api/cron/drip-reminders — daily 09:00 UTC
  Targets free players with unread coach messages.
  Step 1 (Day 0): triggered inline in /api/messages/send when a coach messages a free player.
    Sends Day0 email immediately + inserts step 2 and step 3 rows into drip_jobs.
  Step 2 (Day 3): processed by cron — email only (sendDripDay3Email)
  Step 3 (Day 7): processed by cron — SMS best-effort (sms_opt_in checked) + email (sendDripDay7Email)
  Sequence aborted early if: player upgrades to premium, player opts out (email_marketing_opt_out), or triggering message is read.
- Post-match log nudge: /api/cron/log-nudge — daily 18:00 UTC
  Targets players with an ACTIVE club stint whose likely match day is TODAY
  (modal weekday from their logged history; Saturday until there's enough) and who
  haven't logged that game — fires the evening of the match while it's fresh.
  SMS-first (sms_opt_in + 1/day last_sms_at limit), email fallback
  (sendLogNudgeEmail, respects email_marketing_opt_out). Free — no upsell.
- Weekly digest: /api/cron/weekly-digest — Thursday 08:00 UTC
  Emails every approved player one positive digest (lib/weeklyDigest.ts builds/validates the body).
  4 blocks (On NEXT11VEN / Roles for you / Your week / Your move) with credibility floors — never a
  bare "0" or a deflating number. "On NEXT11VEN" shows coaches active this month (auth last_sign_in_at,
  30d) + new opps this week, and is omitted entirely if neither clears its floor. Block 4 always renders
  so the email is never empty/negative. Free = view
  count + upgrade CTA; premium = named coach list. Unclaimed players (password_set_at IS NULL) get a
  claim-your-account banner and all CTAs funnel to /claim. Respects email_marketing_opt_out.
  Supports ?to=<email> (safe single test) and ?dryRun=1. Bounded-concurrency send, maxDuration 300.
- Coach recommendations: /api/cron/coach-recommendations — Tuesday 08:00 UTC
  Emails each coach a fresh batch of recommended players (sendCoachRecommendationsEmail).
- Weekly metrics (Telegram): /api/cron/weekly-metrics-telegram — Monday 08:00 UTC
  Pushes the weekly platform metrics report to the founder Telegram chat. Internal only.
- Unsubscribe: /api/unsubscribe — sets email_marketing_opt_out = true on profiles
  Note: transactional emails (failed payment, application decisions) must NEVER be suppressed by this flag

- Coach application nudge: /api/cron/application-nudge — daily 10:00 UTC
  Targets coaches with applications still awaiting a reply (pending/viewed/shortlisted)
  on roles that are STILL ACTIVE, oldest ≥3 days. SMS-first (sms_opt_in + 1/day
  last_sms_at cap AND a per-run cap, MAX_SMS_PER_RUN = 40 — past it, the coach
  still gets nudged, just by email), email otherwise (sendApplicationNudgeEmail,
  respects email_marketing_opt_out). One nudge per coach per 5 days regardless of
  backlog size, tracked via profiles.last_application_nudge_at. Supports ?dryRun=1
  and ?to=<email>.
  WHY: 66% of applications were unanswered as of 9 Aug 2026 and every other signal
  (banner, bell, role cards) only reaches coaches who open the app. This one has reach.
  ⚠️ ALSO carries the opportunity-auto-close pre-warning (see below) as an extra
  line on this SAME send when one of the coach's roles is within
  OPP_NEGLECT_WARNING_DAYS of auto-closing — never a separate message. Any future
  addition to this route should ride the existing send rather than add a new one;
  that's how the SMS volume stays bounded as the coach base grows.

- Application closure: /api/cron/application-close — WEEKLY, Monday 11:00 UTC (one
  hour AFTER that morning's nudge, deliberately: a coach who acts on the nudge always
  beats the closure that would have followed it). Weekly not daily because closure is
  bad news, and bad news should arrive rarely rather than steadily.
  Closes applications still awaiting a reply after CLOSE_AFTER_DAYS (21) by setting
  applications.closed_at + close_reason ('no_response', or 'role_closed' if the coach
  took the role down). Max 4 per player per run (MAX_CLOSURES_PER_PLAYER_PER_RUN) so a
  backlog drips rather than landing as a wall of rejection. One 'application_closed'
  notification per player per run, never one per application — and ONLY for
  applications sent within NOTIFY_RESOLUTION_WITHIN_DAYS (42). Anything older
  closes silently: the card updates, nobody is pinged. NO EMAIL, NO SMS ever —
  in-app only.
  ⚠️ 'role_closed' is now MOSTLY set eagerly, not by this sweep — see
  lib/opportunityClosure.ts, fired from opportunity-close and from a coach's
  manual "Close Role" toggle (/api/opportunities/[id] PATCH), the instant the
  role closes. This cron still exists for 'no_response' (an application aging
  out on an otherwise-still-open role) and as a safety net for any 'role_closed'
  the cascade missed — but a player no longer waits up to 21 days after their
  role's actually gone to be told so.
  Params (all for the one-off historic-backlog sweep, not scheduled runs):
    ?dryRun=1        — report what it would do, write nothing
    ?minDays=N       — override the 21-day window
    ?maxPerPlayer=N  — override the per-player cap; raise it for the first sweep so a
                       player with a deep history gets one notification instead of the
                       same bad news over consecutive Mondays
  Both numeric params fall back to their default on anything unparseable, and the
  effective values are echoed in the response — check them when overriding by hand.
  ⚠️ closure is NOT a status value. `status` records what the COACH decided; closed_at
  records that the PLATFORM resolved it because the coach decided nothing. Never
  conflate them — a system action must not masquerade as a rejection in any count.
  Everything that counts "awaiting reply" must filter .is('closed_at', null), and
  isAwaitingReply(status, closedAt) in lib/applicationResponse.ts is the single rule.

- Stale opportunity auto-removal: /api/cron/opportunity-close — WEEKLY, Monday
  11:30 UTC (30 min after that morning's application closure, so a role whose
  stragglers just got auto-closed for no_response is evaluated for closure
  itself in the same pass). HIDES roles (opportunities.is_active = false),
  NEVER deletes. See lib/opportunityLifecycle.ts for the shared rule.
  WHY: application-close's dry run found 81 of 85 stale applications sitting on
  opportunities still marked active — the default coach behaviour is walking
  away without taking the role down, so players (and coaches, on coaching-staff
  roles) keep spending applications into a graveyard. This closes the hole from
  the role's side instead of just the application's.
  Two rules, either one triggers closure:
    'stale'     — OPP_MAX_AGE_DAYS (28). Any active role this old comes down
                  regardless of activity — nothing stays open forever.
    'neglected' — OPP_NEGLECT_DAYS (14). Role has an application still awaiting
                  reply AND the coach has never accepted or rejected anyone on
                  it. A role with zero applications is exempt from this fast
                  track — nothing to neglect yet, only the 28-day rule applies.
  Sets opportunities.auto_closed_at + auto_close_reason ('stale' | 'neglected'),
  distinct from a coach's own manual is_active toggle — the UI (CoachOpportunities)
  shows different chip copy for each, and reopening a role clears both fields.
  ⚠️ Also cascades onto the role's own open applications the moment it closes —
  see lib/opportunityClosure.ts. Resolves them immediately (close_reason
  'role_closed') instead of leaving the player in "With the club" limbo until
  application-close's separate 21-day age sweep would eventually catch up. The
  SAME cascade fires from a coach's manual "Close Role" toggle
  (PATCH /api/opportunities/[id]) — a role going away always resolves its
  applicants right away, whether the platform or the coach closed it.
  One 'opportunity_auto_closed' in-app notification + one email
  (sendOpportunityAutoClosedEmail) per coach per run, listing every role closed
  that run — not one send per role. This one DOES email, unlike application_closed
  — it's actionable (one-tap reopen), where a player watching an application
  close has nothing to do but move on. NO SMS — see the SMS section above for
  why the pre-close warning rides application-nudge instead of sending its own.
  Params: ?dryRun=1 — report what would close, write nothing.

- Message credit refund: /api/cron/message-credit-refund — DAILY, 12:00 UTC.
  Daily, not weekly: this is the one piece of good news in the response-rate family,
  and good news arrives promptly.
  Returns the outreach credit when a coach never replies. Any PLAYER-INITIATED
  conversation with coach_replied_at IS NULL older than REFUND_AFTER_DAYS (14,
  lib/messageCredits.ts) gets +1 to profiles.purchased_message_credits — the
  never-expiring balance, NOT the monthly quota row, because a monthly credit
  refunded mid-period would be worth nothing once the period rolled. So a refunded
  monthly message reappears as an Extra Message; the extra-messages page says so.
  conversations.credit_refunded_at is the idempotency ledger — the update is
  guarded on it being null, and if the credit write then fails the claim is rolled
  back so the next run retries rather than the player silently losing it. The RPC
  nulls it again on a post-cooldown re-approach: a second silence earns a second
  refund. One 'message_credit_refunded' notification per player per run.
  NO EMAIL, NO SMS ever — in-app only. Leads with the credit, never with "a coach
  ignored you"; the coach is never named on any refund surface.
  ⚠️ NOT RETROACTIVE. REFUND_ELIGIBLE_FROM (1 Aug 2026) is a hard floor applied in
  the query: conversations opened before it are never refunded however long they've
  gone unanswered. This is a promise about how the product behaves from now on, not
  a rebate on every message ever sent — backdating it meant 85 credits to 34 players
  (median 39 days old, oldest 512) for messages sent under terms that never included
  a refund. The floor is deliberately NOT a query param, so no hand-typed ?minDays
  can reach past it into history. The coach-profile copy is gated on
  isRefundEligible() for the same reason — never promise a refund that isn't coming.
  Params: ?dryRun=1, ?minDays=N (widens the window, cannot cross the floor), ?max=N
  (per-run row cap, default MAX_REFUNDS_PER_RUN 500; `truncated` in the response
  says whether the run was cut short). Run it dry first — it spends real credits.
  ⚠️ TWO CLOCKS, don't merge them: the credit returns at 14 days so it can be spent
  on someone ELSE, while the 3-month cooldown in initiate_coach_conversation keeps
  the door to THAT coach shut. Shortening the cooldown to match would turn the
  refund into a spam engine pointed at the least responsive coaches.
  The guarantee is sold, not buried: /lib/messageCredits.ts owns the copy
  (REFUND_PROMISE), used on the coach profile at the moment of spend, the
  extra-messages page, and lib/premiumContent.ts (messages feature + comparison row).

All 9 crons are registered in vercel.json. Keep that file and this list in sync.

APIs

Messages
POST /api/messages/send — bidirectional, SMS + email notifications, drip trigger.
  Player sends are premium-gated (403 NOT_PREMIUM) — replies included, admin exempt.
  Players can never create a conversation here; /api/messages/initiate is the only
  path to a new coach and is premium + quota gated. So a lapsed subscriber can
  reach nobody new AND cannot reply into existing threads. ⚠️ RLS enforces the READ
  gate only (20260628000000 leaves INSERT open deliberately) — the send gate lives
  in this route, so don't assume the database is backstopping it.
POST /api/messages/initiate — atomic quota check + conversation creation (calls initiate_coach_conversation RPC)
GET  /api/messages/quota — returns player's current period message quota

Player
GET   /api/player/actively-looking — returns { actively_looking, liveCount } for paywall (liveCount = { n, scope: 'local'|'position', position } | null; null → client shows static PROOF_LINE; only computed for free players, floored at 3, never returns 0/1/2)
PATCH /api/player/actively-looking — toggle actively_looking; server rejects true for non-premium (403 NOT_PREMIUM); player/admin only
POST  /api/player/status-change — update status (free_agent/signed/etc); logs to status_change_log

Coach
GET    /api/coach/recommendations — on-demand recommended players for the logged-in coach
GET    /api/coach/performance-search — Coach Pro: facts-only sortable/filterable tracked stats for players who consented (actively_looking + performance_stats_public); non-premium coaches get { locked: true }
GET    /api/coach/shortlist — list the coach's shortlisted players
POST   /api/coach/shortlist — add a player to the shortlist
DELETE /api/coach/shortlist/[player_id] — remove a player from the shortlist

Opportunities
GET   /api/opportunities — list opportunities
POST  /api/opportunities — create an opportunity (coach)
PATCH /api/opportunities/[id] — coach-owned toggle (is_active). Closing cascades
  onto the role's own open applications via lib/opportunityClosure.ts (see
  Live Automations). Replaced the old direct client-side supabase write from
  CoachOpportunities — that write can no longer touch notifications (service-role
  only), so the toggle needed a server route once closing started resolving
  applications too.
GET  /api/opportunities/counts — per-opportunity application counts
GET  /api/opportunities/feed — player Open Roles feed (gated). Returns active opps + application_count + appliedIds + matchedCount + per-opp { inRange, isCloseMatch }. GATED SERVER-SIDE: `club` is null for non-premium; `matchPercent` (60–99, lib/opportunityRelevance.ts getOpportunityMatchPercent) is computed ONLY for premium — absent from the free payload, never just blurred. Bounded single fetch (limit 200); has a TODO to move to server-side pagination once active-opps count grows.

Applications
POST  /api/applications/apply — premium-gated, fires coach email; players apply to any role, coaches apply to coaching-staff roles only (opportunity_type='coach', not their own)
PATCH /api/applications/[id] — coach accept/reject/shortlist/view with player email

Stripe
POST /api/stripe/checkout — creates subscription checkout session
POST /api/stripe/checkout/message-pack — creates one-time message credit checkout
POST /api/stripe/portal — opens billing portal
POST /api/stripe/sync — syncs premium state on login
POST /api/stripe/webhook — handles Stripe events (subscription lifecycle + message pack)

Admin
POST /api/admin/review — approve/decline with MailerLite + Twilio
POST /api/admin/stripe-reconcile — fixes out-of-sync premium states
GET  /api/admin/reconcile-opportunity-applications — resolves applications stranded
  in "waiting" on an already-closed opportunity (lib/opportunityClosure.ts cascade
  missed it — e.g. closed before that code shipped). Should be a no-op in steady
  state; exists as a safety net. ?dryRun=1 supported.
POST /api/admin/delete-user — hard delete a user account
POST /api/admin/set-agent — admin-only: toggle is_agent on a coach (marks/unmarks them as an agent)
POST /api/admin/rescue-profile — repair orphaned/broken profile
GET  /api/admin/profiles — list all profiles (admin panel)
GET  /api/admin/messages — list recent messages (admin view)
GET  /api/admin/message-stats — message volume stats
GET  /api/admin/platform-stats — calls platform_stats DB function
GET  /api/admin/revenue-stats — calls revenue_stats DB function
GET  /api/admin/recent-applications — recent application activity
GET  /api/admin/recent-logins — recent login activity
GET  /api/admin/orphaned-users — auth users without profiles
GET  /api/admin/coach-leaderboard — calls analytics_coach_leaderboard DB function; ranks coaches by proof of value (accepted applications + player replies weighted above raw activity) for testimonial/outreach targeting. Hidden seed profiles filtered in the route via HIDDEN_PROFILE_IDS
GET  /api/admin/showcase-stats — showcase event stats
GET/POST /api/admin/showcase-payers — showcase payment tracking
GET/POST /api/admin/showcase-waitlist — showcase waitlist tracking

Showcase
POST    /api/showcase/confirm — mark player as showcase-confirmed
GET/POST /api/showcase/link — manage showcase registration links
POST    /api/showcase/remove — remove player from showcase

Community Feed
PATCH/DELETE /api/posts/[id] — edit or delete a post

Registration
POST /api/register/complete — complete signup (sets profile fields, sms_opt_in)

Account
POST /api/account/convert — fan → player/coach conversion. Fan-only (403 otherwise). Server-enforced core-fields gate (player: name/DOB/city/level/position/club; coach: name/role/level/club). Keeps approved=true (instant access, no re-approval), mirrors role into auth metadata, adds to MailerLite group (onUserApproved), notifies founder via Make webhook. Rate-limited (accountConvert, 5/min).

Unsubscribe
POST /api/unsubscribe — sets email_marketing_opt_out on profile

Cron
GET /api/cron/drip-reminders — processes pending drip_jobs (steps 2 and 3)
GET /api/cron/weekly-digest — sends the weekly player digest to all approved players (Thursday)
GET /api/cron/log-nudge — post-match "log your game" nudge to active-stint players (daily)
GET /api/cron/application-nudge — nudges coaches sitting on unanswered applications (daily)
GET /api/cron/application-close — closes unanswered applications on the player's behalf (weekly)
GET /api/cron/opportunity-close — hides stale/neglected opportunities on the coach's behalf (weekly)
GET /api/cron/message-credit-refund — returns the message credit when a coach never replies (daily)
GET /api/cron/coach-recommendations — emails each coach their weekly recommended players
GET /api/cron/weekly-metrics-telegram — pushes weekly platform metrics to founder Telegram chat


Route Map
Auth & Public
Route                         Status
/                             Sign-in page ✅
/register                     Multi-step signup, role picker (Player / Coach) ✅
/pending                      Awaiting approval screen ✅
/claim                        Magic link claim (migration) ✅ do not delete
/set-password                 Set password post-claim ✅ do not delete
/auth/confirm                 Auth callback for magic link confirm ✅
/privacy                      Privacy Policy — real copy live (Last updated June 2026) ✅
/terms                        Terms of Service — real copy live (Last updated June 2026) ✅
/premium/success              Stripe checkout success landing ✅

Player
Route                                   Status
/dashboard/player                       Dashboard — completion score, streak, opportunities, activity ✅
/dashboard/player/profile               Full profile edit, avatar, season stats ✅
/dashboard/player/players               Browse all approved players, filter by position/level/status/club ✅ tier-blind, activity-first, newest-first ordering (premium does NOT float to top); seed/test profiles hidden
/dashboard/player/players/[id]          Player profile, view tracking, shortlist button (Coach Pro gated) ✅
/dashboard/player/market                Redirect shim → /dashboard/opportunities (activity/messages tabs route to their own pages) ↩️
/dashboard/player/premium               Upgrade page ✅
/dashboard/player/messages              Player message inbox ✅
/dashboard/player/opportunities         Redirect → /dashboard/opportunities ↩️
/dashboard/player/coaches               Redirect → /dashboard/coaches ↩️
/dashboard/player/activity              Profile activity overview — Instagram-style grouping of alerts ✅
/dashboard/player/activity/profile-views  Who viewed my profile (detail) ✅
/dashboard/player/extra-messages        Extra message credits balance + purchase ✅

Coach
Route                                        Status
/dashboard/coach                             Dashboard, active opportunities, quick actions ✅
/dashboard/coach/[id]                        Coach profile — visible to any logged-in user ✅
/dashboard/coach/messages                    Bidirectional inbox ✅
/dashboard/coach/shortlists                  Saved players — CRUD wired via /api/coach/shortlist ✅
/dashboard/coach/opportunities               Redirect → /dashboard/opportunities ↩️
/dashboard/coach/market                      4-tab hub: Messages, Opportunities, Shortlists, Activity ✅
/dashboard/coach/players                     Browse players (coach view) ✅ same tier-blind, activity-first, newest-first ordering; seed/test profiles hidden
/dashboard/coach/performance                 Coach Pro: recruit-by-stats dashboard (facts-only sort/filter, consent-gated) ✅
/dashboard/coach/coaches                     Redirect → /dashboard/coaches ↩️
/dashboard/coach/premium                     Coach upgrade page ✅
/dashboard/coach/notifications               Notifications centre ✅
/dashboard/coach/notifications/profile-views  Coach profile views detail ✅

Shared & Admin
Route                         Status
/dashboard/coaches            Unified coaches browse — role-aware via PlayerShell ✅
/dashboard/opportunities      Unified opportunities — role-aware via PlayerShell ✅
/dashboard/profile            Role-aware profile edit (player + coach) ✅
/dashboard/feed               Community feed (posts, likes, comments) ✅
/dashboard/showcase           Showcase Day registration page ✅
/dashboard/become             Fan → player/coach conversion (fan-only; role picker + gated fields) ✅
/dashboard/admin              Approve/decline pending registrations ✅
/dashboard/admin/analytics    Full analytics dashboard — 3 tabs: Health, Coaches, Ops ✅
                              Coaches tab = coach leaderboard for testimonial/outreach targeting.
                              Ranked by proof of value (accepted applications ×15, player replies ×10)
                              NOT raw activity — profile views capped so browsers can't out-rank
                              coaches who got replies. Lazy-loaded on first tab open.

Coaches (unified route)
One page at /dashboard/coaches serves both roles (layout wraps PlayerShell, same pattern
as /feed and /opportunities). Old routes redirect here.
- Both roles: recently active marquee, NewBadge on list items, search + filters, count
- Players only: conversations banner — shows upgrade CTA (free) or remaining quota (premium)
- Coaches: banner suppressed. No CoachBottomNav tab highlights this route (unchanged behaviour).
- Messaging still initiates from /dashboard/coach/[id] — premium-gated, quota-checked there.

Opportunities (unified route)
One page at /dashboard/opportunities serves both roles (layout wraps PlayerShell, same
pattern as /feed — renders the correct sidebar + bottom nav per role). Old routes
(/dashboard/player/opportunities, /dashboard/coach/opportunities) now redirect here.
- Players: Open Roles (browse + apply, premium-gated) + My Applications tabs. The player feed
  loads from /api/opportunities/feed (gated — see above), NOT a direct client table read.
  Card funnels to two paths only: Apply (premium → inline form; free → apply paywall) or go
  Premium. Match-score chip is the premium hook (locked → match paywall for free, NN% for
  premium). "Best matches" is capped at 3 with a star eyebrow + glow, then an inline honest
  premium banner (free only) + divider into "All open roles". Signals are 3 tiers: urgent
  (deadline proximity, NOT the manual boolean), first (0 applied), few (<5 applied).
  My Applications cards have a "View opportunity" deep-link that scrolls/highlights the role.
- Coaches: All Roles (global table) + Your Roles tabs, with "Add Opportunity" and inline
  applicant management (view/accept/reject/close/delete) on their own roles. Coaches can
  apply to OTHER clubs' coaching-staff roles (opportunity_type='coach', Coach Pro gated).
- Card UI lives in app/components/OpportunityBadges.tsx (StepBadge + LevelBadge),
  reused by the homepage opportunity previews too. Level labels come from lib/opportunityLevel.ts.
  Club crest chips were removed from all opportunity surfaces — do not reintroduce them.
- STEP COLOUR: lib/stepTokens.ts (STEP_TOKENS + getStepToken) is the SINGLE source of truth for
  non-league step colours — badges, the card's left accent rail, LevelBadge (opportunityLevel.ts
  sources its Step 1–7 colours from here), and future map pins / filter chips. Never hardcode a
  step colour anywhere else. Out-of-±1-step roles desaturate to slate as a "for you" signal.
- The apply/match paywalls reuse ActivelyLookingModal via its `variant` prop ('apply' | 'match'
  | 'toggle') — apply-/match-specific copy, not the Actively Looking toggle copy.

Profile Completion Score
13-field score — used on player homepage and profile page. Must stay in sync:
avatar_url, position, club, city, status, phone, date_of_birth, foot, height, playing_level, highlight_urls, bio, season stats

Shared Components

Breadcrumb — all deep pages
PremiumLock — wherever features are gated
CoachBottomNav + CoachSidebar — persistent on coach routes via coach/layout.tsx
BottomNav — persistent on player routes via player/layout.tsx
/dashboard/profile — role-aware, shared between player and coach

Badges & chips (identity signals on names across lists, carousels, marquees, public profiles, feed):
- FounderBadge (app/components/FounderBadge.tsx) — navy chip. isFounder(role) === (role === 'admin'). Shown next to Jamal everywhere.
- AgentBadge (app/components/AgentBadge.tsx) — amber chip, REPLACES the COACH chip. isAgent(p) === (role === 'coach' && is_agent === true). Amber is deliberate — never green (green is availability-only).
- NewBadge — recency signal on browse list items + coaches list.
- Every surface that renders a role chip should render the founder/agent variant when applicable — use the isFounder/isAgent helpers, never re-derive the rule inline.

Hidden profiles (lib/hiddenProfiles.ts):
- HIDDEN_PROFILE_IDS / HIDDEN_PROFILE_FILTER — seed/test/internal accounts stay fully live (sign in + every journey works) but are filtered out of ALL discovery surfaces: player/coach browse, Actively Looking + Featured carousels, Recently Active marquees, coach recommendations.
- Their own profile page (/dashboard/player/players/[id]) is intentionally NOT filtered — direct access still works so you can log in as them and verify flows end to end.
- When adding a new discovery query, apply .not('id', 'in', HIDDEN_PROFILE_FILTER).

Premium conversion surfaces (all copy from lib/premiumContent.ts — single source of truth, never hardcode):
- lib/premiumContent.ts — canonical copy/stats/feature order. PROOF_LINE, PREMIUM_STATS, MODAL_BULLETS, COMPARISON_ROWS, DISCOVER_EMOTIONAL_LINE, price constants, liveCountSuffix(). RULE: every surface sells "pay to be found" in this order with these exact figures.
- ActivelyLookingModal — paywall when a free player reaches for the Actively Looking toggle (replaces old inline modals in player/page + profile/page)
- LockedMessageTrigger — locked inbound-message screen; fires when a non-premium player taps a locked conversation. Renders SYNTHETIC blurred preview only — real message body never sent to non-premium clients
- LiveCoachCount — animated live-demand count; self-fetches /api/player/actively-looking or takes a value prop; falls back to PROOF_LINE when count < 3
- PremiumComparison — Free vs Premium table (full = 6 rows / compact = 3); shown to free AND premium players on the premium page
- ProBadge (app/components/ProBadge.tsx) — the PRO tier marker. Replaced the ★ star
  next to premium users' names (18 Aug 2026). One component, identical for players
  and coaches — the paid tier isn't role-specific. Blue (brand primary), no pill/border/icon,
  deliberately quieter than FounderBadge/AgentBadge so it reads as a tier marker,
  not a verification credential.

⚠️ NAMING DIVERGENCE (18 Aug 2026, deliberate): the paid tier is "Pro" in all
user-facing copy and in the Stripe Product display names ("Player Pro" / "Coach
Pro" — renamed live in Stripe, Product objects only, no Price objects touched).
The database schema, API fields, and RLS policies still use "premium" terminology
(premium, is_premium-style flags, NOT_PREMIUM error codes, /dashboard/*/premium
route paths). Do not rename schema/API/routes to match UI copy in a future
session — this divergence is intentional, not drift. One exception left as-is:
the legacy £5/mo grandfathered Stripe product ("NEXT11VEN - Premium",
prod_SMeNP07NDIoS0K) was NOT renamed — it wasn't in scope of the Pro rename and
needs a founder decision before touching it.


Known Gaps (prioritised)
Confirmed open issues. Fix in this order:

(none currently blocking)

Recently closed (no longer gaps — kept for context):
- Opportunities POST coach-role check — /api/opportunities POST now loads the poster's profile and rejects anyone who isn't coach/admin (403). Closes the hole where any authenticated user (player/fan) could create a role via the API. ✅
- Zod validation — now on ALL 17 body-reading API routes (every route that reads req.json()). safeParse after the auth/rate-limit checks, returns 400 on bad shape. Existing error strings preserved. Pattern: define a z.object schema per route (see any route for the shape). ✅
- Rate limiting — per-user Upstash sliding-window limiter (lib/ratelimit.ts) on the cost-bearing/abuse-prone routes: messages/send (20/min), messages/initiate (10/min), applications/apply (10/min), stripe/checkout + message-pack (10/min), register/complete (5/min). Fail-open if Upstash unconfigured. Env: UPSTASH_REDIS_KV_REST_API_URL/TOKEN (Preview + Production only — local dev runs with limiting OFF). ✅
- Privacy Policy & Terms — real copy now live at /privacy and /terms. ✅
- Error pages — app/error.tsx + app/not-found.tsx now exist. ✅
- Shortlist CRUD API — built at /api/coach/shortlist (+ [player_id]). ✅
- Pagination on player browse — server-side pagination live on player + coach browse. ✅
- Avatar upload — wired to Supabase Storage (storage.from().upload()) in profile pages. ✅


Current State — Migration & Activation
Glide Migration — COMPLETE

All users and messages migrated into Supabase ✅
Glide subscription cancelled ✅
Remaining Glide data intentionally left behind (not needed)
next11ven.co.uk now redirects to app.next11ven.com ✅
⚠️ Only ~10% of migrated users have signed into the new app so far
Users who saved old Glide PWA to homescreen may still be hitting it — resolves naturally over time
No content push has been made yet — launch video + paid ad is the planned activation trigger

Domain Setup

next11ven.com — static landing page (separate repo: NEXT11VENwebsite)
next11ven.co.uk — redirects to app.next11ven.com (Glide gone)
app.next11ven.com — production ✅


Build Priorities — What's Next
Immediate (fix + activate)

Ship launch video + paid ad to drive existing users onto the new app
Re-engagement email/SMS to the ~90% who haven't signed in yet

Growth & Monetisation

Premium conversion optimisation (paywall placement, coach activity as conversion trigger)
Coach engagement tools (activity nudges, opportunity expiry reminders)
Showcase Day event tooling
Club partnership + sponsor tooling

Feature Depth

~~Fan onboarding: MailerLite automation~~ — dropped, fan signup is closed
Highlight reel improvements
Push notifications (web push or in-app)


Code Style

Dark theme throughout, mobile-first
No over-engineering — solo build, keep it shippable
Server components where possible, client only where needed
Never put API keys or Twilio/Stripe/MailerLite/Resend calls client-side
Green limited to availability signals, positive confirmations, and positive analytics movement (growth vs previous period) — see Brand & Style
No emoji in JSX or UI copy (18 Aug 2026). All icons go through components/ui/Icon.tsx
(lucide-react, single stroke weight — 1.75 — across the app, colour always inherited
via currentColor, never passed as a prop). Exceptions: the ★/✓/✕ dingbat glyphs
already in use (e.g. "★ Your role", "✓ Applied") are plain Unicode symbols, not
emoji — same category as the → arrows used for navigation copy throughout the app —
and were deliberately left alone rather than forced into the icon system. Emoji in
lib/weeklyReport.ts (the founder's own Telegram report) and the ✅/❌ in
lib/email.ts's application-decision HTML email are also left as-is: neither is
app UI — one is an internal ops message, the other a different rendering medium
lucide icons don't reach.

Tone
Direct, no fluff. Flag issues immediately. Don't pad responses.
