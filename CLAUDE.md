NEXT11VEN — Claude Code Context

What this is
Custom non-league football recruitment platform. Live at app.next11ven.com.
Glide is dead. Migration is complete. Focus is now usage, activation, and monetisation.
Solo founder build. Launched April 2026.
Stack
Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (PostgreSQL + Auth + Storage),
Stripe, Twilio, Resend, MailerLite, Vercel (production at app.next11ven.com)
Brand & Style

Background: #0a0a0a — Surface: #13172a — Border: #1e2235
Primary blue: #2d5fc4 → #3a6fda hover
Cream text: #e8dece — Muted text: #8892aa
Headings: Barlow Condensed (bold, uppercase) — Body: Inter
No green anywhere — ever
Mobile-first. Dark theme throughout. No over-engineering.


Database
Single source of truth: profiles table.

⚠️ player_profiles and coach_profiles exist in Supabase but are ORPHANED — do not read or write to them, do not reference them


Role: 'player' | 'coach' | 'admin' | 'fan'
Fan accounts = browse-only. No posting, no messaging.
admin role also counts as a player — use .in('role', ['player', 'admin']) for player queries
approved: boolean — approval_status: text (pending | approved | declined)
premium: boolean — flipped by Stripe webhook
Status values: free_agent | signed | loan_dual_reg | just_exploring

Key columns:
id, email, full_name, role, approved, approval_status, position, secondary_position, club, avatar_url, status, premium, weekly_views, created_at, goals, assists, appearances, season, streak_weeks, streak_last_week, last_active, highlight_urls, date_of_birth, city, location, playing_level, foot, height, coaching_level, coaching_role, coaching_history, gdpr_consent, referral, phone, sms_opt_in, is_active, bio, updated_at
Active tables
profiles, conversations, messages, player_views, shortlist_alerts,
coach_saved_players, subscriptions, opportunities, applications, bookmarks,
highlights, notifications, partner_discounts, status_change_log, likes,
premium_clicks, profile_views
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
Checkout: /api/stripe/checkout — Webhook: /api/stripe/webhook — Portal: /api/stripe/portal
Webhook flips premium on profiles + writes to subscriptions table
Premium synced on first dashboard login
Admin reconcile tool at /dashboard/admin for out-of-sync states

Twilio ✅ LIVE (always enabled — no feature flag)

SMS on admin approval + new messages
Rate limit: 1 SMS per recipient per day (non-blocking)
⚠️ sms_opt_in column exists on profiles but is not checked before sending — known gap
Env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

Resend ✅ LIVE

Transactional emails: message notifications, application received, application decisions
From: NEXT11VEN hello@next11ven.com
Feature flagged: RESEND_ENABLED in .env
Env vars: RESEND_API_KEY, RESEND_FROM_EMAIL

MailerLite ✅ LIVE

Fires on admin approval and premium upgrade
Approved Players group: 181864482947991450
Approved Coaches group: 181864480498517498
Skips existing subscribers — no duplicate sequences
Tags: player_premium, coach_pro on upgrade
Feature flagged: MAILERLITE_ENABLED in .env

Meta Pixel ✅ LIVE

Pixel ID: 943750121308525
Page view tracking injected globally

Vercel Analytics ✅ LIVE

APIs (9 endpoints)

POST /api/messages/send — bidirectional, SMS + email notifications
POST /api/applications/apply — premium-gated, fires coach email
PATCH /api/applications/[id] — coach accept/reject/shortlist/view with player email
POST /api/stripe/checkout — creates Stripe checkout session
POST /api/stripe/portal — opens billing portal
POST /api/stripe/sync — syncs premium state on login
POST /api/stripe/webhook — handles Stripe events
POST /api/admin/review — approve/decline with MailerLite + Twilio
POST /api/admin/stripe-reconcile — fixes out-of-sync premium states


Route Map
Auth & Public
RouteStatus/Sign-in page ✅/registerMulti-step signup, role picker (Player / Coach) ✅/pendingAwaiting approval screen ✅/claimMagic link claim (migration) ✅ do not delete/set-passwordSet password post-claim ✅ do not delete
Player
RouteStatus/dashboard/playerDashboard — completion score, streak, opportunities, activity ✅/dashboard/player/profileFull profile edit, avatar, season stats ✅/dashboard/player/playersBrowse all approved players, filter by position/level/status/club ✅/dashboard/player/players/[id]Player profile, view tracking, shortlist button (Coach Pro gated) ✅/dashboard/player/marketOpportunities, Applications, Activity tabs (premium gated) ✅/dashboard/player/premiumUpgrade page ✅
Coach
RouteStatus/dashboard/coachDashboard, active opportunities, quick actions ✅/dashboard/coach/[id]Coach profile — visible to any logged-in user ✅/dashboard/coach/messagesBidirectional inbox ✅/dashboard/coach/shortlistsSaved players (frontend built, no CRUD API yet) ⚠️/dashboard/coach/opportunitiesPost and manage roles ✅/dashboard/coach/market4-tab hub: Messages, Opportunities, Shortlists, Activity ✅
Shared & Admin
RouteStatus/dashboard/profileRole-aware profile edit (player + coach) ✅/dashboard/adminApprove/decline pending registrations ✅/dashboard/admin/analyticsShell exists, real data queries incomplete ⚠️

Profile Completion Score
13-field score — used on player homepage and profile page. Must stay in sync:
avatar_url, position, club, city, status, phone, date_of_birth, foot, height, playing_level, highlight_urls, bio, season stats

Shared Components

Breadcrumb — all deep pages
PremiumLock — wherever features are gated
CoachBottomNav + CoachSidebar — persistent on coach routes via coach/layout.tsx
BottomNav — persistent on player routes via player/layout.tsx
/dashboard/profile — role-aware, shared between player and coach


Known Gaps (prioritised)
Confirmed issues. Fix in this order:

Privacy Policy & Terms — placeholder copy only. Legal risk with paying customers. Fix immediately.
SMS opt-in not enforced — sms_opt_in column exists but is never checked before sending.
No error pages — no error.tsx or not-found.tsx. Users hit raw errors or white screens.
No rate limiting — checkout, messaging, apply routes all unprotected.
Shortlist CRUD API — frontend is built (307 lines), no API behind it.
No input validation (Zod) — API routes trust all incoming payloads.
No pagination on player browse — will degrade at scale.
Admin analytics — page shell exists, real data queries incomplete.
Avatar upload — avatar_url field and UI exist; verify Supabase Storage + upload API are wired end-to-end.


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
Privacy Policy + Terms (legal requirement, paying customers exist)
SMS opt-in enforcement
Error pages

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
Pagination on player browse
Complete admin analytics


Code Style

Dark theme throughout, mobile-first
No over-engineering — solo build, keep it shippable
Server components where possible, client only where needed
Never put API keys or Twilio/Stripe/MailerLite/Resend calls client-side
No green in UI ever

Tone
Direct, no fluff. Flag issues immediately. Don't pad responses.