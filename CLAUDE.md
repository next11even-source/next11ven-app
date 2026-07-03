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
Green (#22c55e) limited to availability signals (Actively Looking dot/chip/toggle) and positive confirmations only — never for general UI
Mobile-first. Dark theme throughout. No over-engineering.


Database
Single source of truth: profiles table.

⚠️ player_profiles and coach_profiles exist in Supabase but are ORPHANED — do not read or write to them, do not reference them


Role: 'player' | 'coach' | 'admin' | 'fan'
Fan accounts = browse-only. No posting, no messaging.
admin role also counts as a player — use .in('role', ['player', 'admin']) for player queries
approved: boolean — approval_status: text (pending | approved | declined)
premium: boolean — flipped by Stripe webhook
actively_looking: boolean — premium-only toggle for player visibility; NOT auto-enabled on upgrade (player must opt in); server-enforced (API rejects true for non-premium)
Status values: free_agent | signed | loan_dual_reg | just_exploring
⚠️ status is a profile display field only. The "Free Agents" filter and Actively Looking carousel use actively_looking, NOT status = 'free_agent'

Key columns:
id, email, full_name, role, approved, approval_status, position, secondary_position, club, avatar_url, status, premium, actively_looking, weekly_views, created_at, goals, assists, appearances, season, streak_weeks, streak_last_week, last_active, highlight_urls, date_of_birth, city, location, playing_level, foot, height, coaching_level, coaching_role, coaching_history, gdpr_consent, referral, phone, sms_opt_in, is_active, bio, updated_at, purchased_message_credits, showcase_confirmed, showcase_confirmed_at, email_marketing_opt_out, last_sms_at

Active tables
profiles, conversations, messages, player_views, shortlist_alerts,
coach_saved_players, subscriptions, opportunities, applications, bookmarks,
highlights, notifications, partner_discounts, status_change_log, likes,
premium_clicks, profile_views,
posts, post_likes, post_comments, post_interests,
player_message_quota, drip_jobs

Orphaned — never use
player_profiles, coach_profiles

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

Live Automations
- Drip sequence: /api/cron/drip-reminders — daily 09:00 UTC
  Targets free players with unread coach messages.
  Step 1 (Day 0): triggered inline in /api/messages/send when a coach messages a free player.
    Sends Day0 email immediately + inserts step 2 and step 3 rows into drip_jobs.
  Step 2 (Day 3): processed by cron — email only (sendDripDay3Email)
  Step 3 (Day 7): processed by cron — SMS best-effort (sms_opt_in checked) + email (sendDripDay7Email)
  Sequence aborted early if: player upgrades to premium, player opts out (email_marketing_opt_out), or triggering message is read.
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

All 4 crons are registered in vercel.json. Keep that file and this list in sync.

APIs

Messages
POST /api/messages/send — bidirectional, SMS + email notifications, drip trigger
POST /api/messages/initiate — atomic quota check + conversation creation (calls initiate_coach_conversation RPC)
GET  /api/messages/quota — returns player's current period message quota

Player
GET   /api/player/actively-looking — returns { actively_looking, liveCount } for paywall (liveCount = { n, scope: 'local'|'position', position } | null; null → client shows static PROOF_LINE; only computed for free players, floored at 3, never returns 0/1/2)
PATCH /api/player/actively-looking — toggle actively_looking; server rejects true for non-premium (403 NOT_PREMIUM); player/admin only
POST  /api/player/status-change — update status (free_agent/signed/etc); logs to status_change_log

Coach
GET    /api/coach/recommendations — on-demand recommended players for the logged-in coach
GET    /api/coach/shortlist — list the coach's shortlisted players
POST   /api/coach/shortlist — add a player to the shortlist
DELETE /api/coach/shortlist/[player_id] — remove a player from the shortlist

Opportunities
GET  /api/opportunities — list opportunities
POST /api/opportunities — create an opportunity (coach)
GET  /api/opportunities/counts — per-opportunity application counts

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
POST /api/admin/delete-user — hard delete a user account
POST /api/admin/rescue-profile — repair orphaned/broken profile
GET  /api/admin/profiles — list all profiles (admin panel)
GET  /api/admin/messages — list recent messages (admin view)
GET  /api/admin/message-stats — message volume stats
GET  /api/admin/platform-stats — calls platform_stats DB function
GET  /api/admin/revenue-stats — calls revenue_stats DB function
GET  /api/admin/recent-applications — recent application activity
GET  /api/admin/recent-logins — recent login activity
GET  /api/admin/orphaned-users — auth users without profiles
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

Unsubscribe
POST /api/unsubscribe — sets email_marketing_opt_out on profile

Cron
GET /api/cron/drip-reminders — processes pending drip_jobs (steps 2 and 3)
GET /api/cron/weekly-digest — sends the weekly player digest to all approved players (Thursday)
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
/dashboard/player/players               Browse all approved players, filter by position/level/status/club ✅
/dashboard/player/players/[id]          Player profile, view tracking, shortlist button (Coach Pro gated) ✅
/dashboard/player/market                Redirect shim → /dashboard/opportunities (activity/messages tabs route to their own pages) ↩️
/dashboard/player/premium               Upgrade page ✅
/dashboard/player/messages              Player message inbox ✅
/dashboard/player/opportunities         Redirect → /dashboard/opportunities ↩️
/dashboard/player/coaches               Redirect → /dashboard/coaches ↩️
/dashboard/player/activity              Profile activity overview ✅
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
/dashboard/coach/players                     Browse players (coach view) ✅
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
/dashboard/admin              Approve/decline pending registrations ✅
/dashboard/admin/analytics    Full analytics dashboard (revenue, platform, messages) ✅

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
- Players: Open Roles (browse + apply, premium club-gate) + My Applications tabs.
  My Applications cards have a "View opportunity" deep-link that scrolls/highlights the role.
- Coaches: All Roles (global table) + Your Roles tabs, with "Add Opportunity" and inline
  applicant management (view/accept/reject/close/delete) on their own roles. Coaches can
  apply to OTHER clubs' coaching-staff roles (opportunity_type='coach', Coach Pro gated).
- Card UI lives in app/components/OpportunityBadges.tsx (LevelBadge + ClubCrest), reused by
  the homepage opportunity previews too. Level colours/labels come from lib/opportunityLevel.ts.

Profile Completion Score
13-field score — used on player homepage and profile page. Must stay in sync:
avatar_url, position, club, city, status, phone, date_of_birth, foot, height, playing_level, highlight_urls, bio, season stats

Shared Components

Breadcrumb — all deep pages
PremiumLock — wherever features are gated
CoachBottomNav + CoachSidebar — persistent on coach routes via coach/layout.tsx
BottomNav — persistent on player routes via player/layout.tsx
/dashboard/profile — role-aware, shared between player and coach

Premium conversion surfaces (all copy from lib/premiumContent.ts — single source of truth, never hardcode):
- lib/premiumContent.ts — canonical copy/stats/feature order. PROOF_LINE, PREMIUM_STATS, MODAL_BULLETS, COMPARISON_ROWS, DISCOVER_EMOTIONAL_LINE, price constants, liveCountSuffix(). RULE: every surface sells "pay to be found" in this order with these exact figures.
- ActivelyLookingModal — paywall when a free player reaches for the Actively Looking toggle (replaces old inline modals in player/page + profile/page)
- LockedMessageTrigger — locked inbound-message screen; fires when a non-premium player taps a locked conversation. Renders SYNTHETIC blurred preview only — real message body never sent to non-premium clients
- LiveCoachCount — animated live-demand count; self-fetches /api/player/actively-looking or takes a value prop; falls back to PROOF_LINE when count < 3
- PremiumComparison — Free vs Premium table (full = 6 rows / compact = 3); shown to free AND premium players on the premium page


Known Gaps (prioritised)
Confirmed open issues. Fix in this order:

Opportunities POST has no coach-role check — /api/opportunities POST lets ANY authenticated user (player/fan/coach) create an opportunity with coach_id = their own id. UI only exposes it to coaches, but the API doesn't enforce it. Add a role guard.

Recently closed (no longer gaps — kept for context):
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
Add coach-role guard to /api/opportunities POST (currently any user can post a role)

Growth & Monetisation

Premium conversion optimisation (paywall placement, coach activity as conversion trigger)
Coach engagement tools (activity nudges, opportunity expiry reminders)
3-month stale opportunity auto-removal
Showcase Day event tooling
Club partnership + sponsor tooling

Feature Depth

Fan onboarding: MailerLite automation not yet built (same pattern as player/coach)
Highlight reel improvements
Push notifications (web push or in-app)


Code Style

Dark theme throughout, mobile-first
No over-engineering — solo build, keep it shippable
Server components where possible, client only where needed
Never put API keys or Twilio/Stripe/MailerLite/Resend calls client-side
Green limited to availability signals and positive confirmations

Tone
Direct, no fluff. Flag issues immediately. Don't pad responses.
