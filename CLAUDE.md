# NEXT11VEN — Claude Code Context

## What this is
Custom non-league football recruitment platform.
Replacing a Glide no-code app (currently live at next11ven.co.uk).
Solo founder build. Stack is production-ready, approaching first deployment.

## Stack
Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase (PostgreSQL +
Auth + Storage), Stripe, Twilio, MailerLite, Vercel (hosting live at app.next11ven.com)

## Brand & Style
- Background: `#0a0a0a` — Surface: `#13172a` — Border: `#1e2235`
- Primary blue: `#2d5fc4` → `#3a6fda` hover
- Cream text: `#e8dece` — Muted text: `#8892aa`
- Headings: Barlow Condensed (bold, uppercase) — Body: Inter
- **No green anywhere — ever**
- Mobile-first. Dark theme throughout. No over-engineering.

## Database
Single source of truth: `profiles` table.
- `player_profiles` and `coach_profiles` exist in Supabase but are **ORPHANED — do not read or write to them, do not reference them**
- Role: `'player' | 'coach' | 'admin' | 'fan'` — fan/supporter accounts are accepted (view-only, no posting or messaging)
- `admin` role also counts as a player — use `.in('role', ['player', 'admin'])` for player queries
- `approved`: boolean — `approval_status`: text (`pending` | `approved` | `declined`)
- `premium`: boolean — flipped by Stripe webhook
- Status values: `free_agent` | `signed` | `loan_dual_reg` | `just_exploring`
- All player and coach specific fields live directly on `profiles`

Key columns: `id, email, full_name, role, approved, approval_status, position, secondary_position, club, avatar_url, status, premium, weekly_views, created_at, goals, assists, appearances, season, streak_weeks, streak_last_week, last_active, highlight_urls, date_of_birth, city, location, playing_level, foot, height, coaching_level, coaching_role, coaching_history, gdpr_consent, referral, phone, sms_opt_in, is_active, bio, updated_at`

## Database tables in use
`profiles`, `conversations`, `messages`, `player_views`, `shortlist_alerts`, `coach_saved_players`, `subscriptions`, `opportunities`, `applications`, `bookmarks`, `highlights`, `notifications`, `partner_discounts`, `status_change_log`, `likes`, `premium_clicks`, `profile_views`

## Orphaned — do not use
`player_profiles`, `coach_profiles`

## Auth & Middleware
- Supabase auth via `@supabase/ssr` — email/password + magic link
- Email confirmation disabled (for now)
- `middleware.ts` protects all `/dashboard/*` routes
- Role-based redirects: `player` / `admin` → `/dashboard/player`, `coach` → `/dashboard/coach`
- Unapproved users → `/pending`
- Magic link claim flow: `/claim` → `/set-password` (kept for Glide migration — do not delete)
- Admin users bypass all role checks in middleware

## Messaging
- Bidirectional via `conversations` + `messages` tables
- `POST /api/messages/send` — coach sends `{ player_id, content }`, player sends `{ coach_id, content }`
- `initiated_by uuid` on conversations — used to split coach "Messages" vs "Requests" tabs
- Validates recipient exists and is approved before creating conversation
- SMS notifications via Twilio (non-blocking)

## Integrations — all built, feature flagged

### Stripe ✅
- Player Premium: £6.99/mo — Coach Pro: £9.99/mo
- Checkout: `/api/stripe/checkout` — Webhook: `/api/stripe/webhook` — Portal: `/api/stripe/portal`
- Webhook flips `premium` on `profiles` + writes to `subscriptions` table
- Premium synced on first dashboard login
- NOT YET TESTED IN PRODUCTION — needs live Stripe env vars in Vercel

### MailerLite ✅
- Fires on admin approval and premium upgrade
- Approved Players group: `181864482947991450` — Approved Coaches group: `181864480498517498`
- Skips existing subscribers — no duplicate sequences
- Tags: `player_premium`, `coach_pro` on upgrade
- Feature flagged: `MAILERLITE_ENABLED` in `.env`

### Twilio ✅
- SMS notifications on new messages (non-blocking, won't break message send if it fails)
- Feature flagged: `TWILIO_ENABLED` in `.env`
- Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

### Resend ✅
- Transactional emails: new message notifications, 
  application received notifications
- From: NEXT11VEN <hello@next11ven.com>
- Feature flagged: RESEND_ENABLED in .env
- Env vars: RESEND_API_KEY, RESEND_FROM_EMAIL

## Feature Flags
```
MAILERLITE_ENABLED=false   # set true in Vercel production
TWILIO_ENABLED=false       # set true in Vercel production
```
All integration code checks these flags before firing. Prevents real emails/SMS during local dev.

## Current Build Status

### Auth & Routing
| Route | Status |
|---|---|
| `/` | Sign-in page ✓ |
| `/register` | Multi-step signup, role picker (Player / Coach) ✓ |
| `/pending` | Awaiting approval screen ✓ |
| `/claim` | Magic link claim (migration flow) ✓ |
| `/set-password` | Set password post-claim ✓ |

### Player Side
| Route | Status |
|---|---|
| `/dashboard/player` | Dashboard — completion score, streak, opportunities, activity preview ✓ |
| `/dashboard/player/profile` | Full profile edit, avatar upload, season stats ✓ |
| `/dashboard/player/players` | Browse all approved players, filter by position/level/status/club ✓ |
| `/dashboard/player/players/[id]` | Full player profile, view tracking, shortlist button (Coach Pro gated) ✓ |
| `/dashboard/player/market` | Opportunities, Applications, Activity tabs (premium gated) ✓ |
| `/dashboard/player/premium` | Upgrade page (Stripe not yet tested in prod) |

### Coach Side
| Route | Status |
|---|---|
| `/dashboard/coach` | Dashboard, active opportunities, quick actions ✓ |
| `/dashboard/coach/[id]` | Authenticated coach profile — visible to any logged-in user ✓ |
| `/dashboard/coach/messages` | Bidirectional inbox ✓ |
| `/dashboard/coach/shortlists` | Saved players ✓ |
| `/dashboard/coach/opportunities` | Post and manage roles ✓ |
| `/dashboard/coach/market` | 4-tab hub: Messages, Opportunities, Shortlists, Activity ✓ |

### Shared & Admin
| Route | Status |
|---|---|
| `/dashboard/profile` | Role-aware profile edit (player + coach) ✓ |
| `/dashboard/admin` | Approve/decline pending registrations, triggers MailerLite ✓ |

## Profile Completion
13-field score used on both player homepage and profile page — must stay in sync:
`avatar_url, position, club, city, status, phone, date_of_birth, foot, height, playing_level, highlight_urls, bio, season stats`

## Shared Components
- `Breadcrumb` — on all deep pages
- `PremiumLock` — wherever features are gated
- `CoachBottomNav` + `CoachSidebar` — persistent on all coach routes via `coach/layout.tsx`. Role-aware — hides for non-coach users
- Player `BottomNav` — persistent on player routes via `player/layout.tsx`
- `/dashboard/profile` — role-aware, shared between player and coach

## Known gaps before production
- Stripe needs testing in live environment
- No pagination on player browse (needed before scale)
- `set-password` page needs guard against direct navigation without active magic link session

## Upcoming: Glide data migration
- ~700 existing users on Glide/Google Sheets (next11ven.co.uk)
- Plan: export CSVs → scripts to create Supabase auth accounts → populate `profiles` → migrate messages
- `/claim` + `/set-password` are the user-facing side of this — do not delete these routes
- Existing MailerLite subscribers will be skipped on approval (duplicate protection built)
- Migration happens on cutover day, not before

## Deployment plan
1. Deploy to Vercel staging (app.next11ven.com or preview URL)
2. Test all flows as real users on real devices
3. Test Stripe payments in live mode
4. Migrate Glide data via scripts
5. Point next11ven.co.uk to new app on cutover

## Domain setup
- `next11ven.com` — landing page (separate)
- `next11ven.co.uk` — current live Glide app — **do not touch**
- New app deploys to staging first, then replaces `.co.uk` on cutover

## Code style
- Dark theme throughout, mobile-first
- No over-engineering — solo build, keep it shippable
- Server components where possible, client only where needed
- Never put API keys or Twilio/Stripe/MailerLite calls client-side
- No green in UI ever

## Tone
Direct, no fluff. Flag issues immediately. Don't pad responses.
