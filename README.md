# NEXT11VEN App

Custom recruitment platform for non-league football. Connects players with coaches and clubs. Replacing a Glide no-code app — solo founder build.

## Tech Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Supabase (PostgreSQL + Auth + Storage)
- Stripe — Player Premium £6.99/mo, Coach Pro £9.99/mo
- Twilio SMS — approval and message notifications
- MailerLite — onboarding email sequences
- Vercel Analytics — page-level visit tracking
- Resend — transactional email

## Run locally

```bash
npm run dev
# → http://localhost:3000
```

## Environment variables

Copy `.env.local.example` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PLAYER_PRICE_ID
NEXT_PUBLIC_STRIPE_COACH_PRICE_ID
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
TWILIO_ENABLED=false
MAILERLITE_API_KEY
MAILERLITE_ENABLED=false
RESEND_API_KEY
APP_URL
NEXT_PUBLIC_SITE_URL
```

Feature flags `TWILIO_ENABLED` and `MAILERLITE_ENABLED` default to `false` — set `true` in Vercel production only.

## Key decisions

- Single `profiles` table for all roles — `player_profiles` and `coach_profiles` exist but are **orphaned, do not use them**
- Role values: `player` | `coach` | `admin` | `fan`
- `admin` role users also appear in player lists (founder is both)
- `approved` boolean + `approval_status` text (`pending` / `approved` / `declined`) — admin must approve all new signups including fans
- Fan/supporter accounts are accepted — view-only access, no posting or messaging
- Premium stored as boolean on `profiles`, flipped by Stripe webhook
- Auth flow: sign in → middleware checks `approved` + `role` → redirects to correct dashboard
- Status values: `free_agent` | `signed` | `loan_dual_reg` | `just_exploring` (fans default to `just_exploring`)
- Players and coaches have fully separate Stripe flows — never cross-routed

## Routes

| Route | Who | Notes |
|---|---|---|
| `/` | All | Sign-in |
| `/register` | All | Role picker: Player / Coach / Supporter |
| `/pending` | All | Awaiting admin approval |
| `/dashboard/player` | Player / Admin | Dashboard with streak, stats, opportunities |
| `/dashboard/player/profile` | Player | Profile edit, avatar, season stats |
| `/dashboard/player/players` | Player | Browse all approved players |
| `/dashboard/player/market` | Player | Opportunities, applications, activity (premium gated) |
| `/dashboard/player/premium` | Player | Upgrade page → Stripe checkout |
| `/dashboard/player/messages` | Player | Inbox — coach identity hidden until premium |
| `/dashboard/coach` | Coach | Dashboard with stats, premium player carousel |
| `/dashboard/coach/messages` | Coach | Bidirectional inbox with Requests / Messages tabs |
| `/dashboard/coach/opportunities` | Coach | Post and manage roles |
| `/dashboard/coach/shortlists` | Coach | Saved players (Coach Pro gated) |
| `/dashboard/coach/premium` | Coach | Coach Pro upgrade page → Stripe checkout |
| `/dashboard/profile` | All | Shared role-aware profile edit with notifications |
| `/dashboard/admin` | Admin | Approve / decline pending registrations |
| `/dashboard/admin/analytics` | Admin | Platform stats with charts — signups, messages, views |
| `/premium/success` | All | Post-Stripe confirmation, role-aware |

## Recent changes (Apr 2026)

- **Fan / Supporter accounts** — registration restored with correct `status = just_exploring` default; shows in admin for approval; approval SMS says "supporter account"
- **Coach Pro page** — dedicated `/dashboard/coach/premium` with green branding; all coach upgrade links fixed
- **Stripe routing** — players and coaches fully separated across checkout, cancel, and portal return URLs
- **Sidebar coverage** — hamburger menu added to every coach and player page that was missing it (messages, opportunities, shortlists, profile)
- **Player messages** — coach identity (name, avatar, club) hidden for non-premium players; blurred avatar, upgrade CTA shown instead
- **Unread badge** — clears immediately when conversation is opened, not on back navigation
- **Admin analytics** — inline SVG charts for signups, messages, profile views with 7d / 30d / 90d / all-time selector; admin-only access
- **MailerLite field fix** — `are_you_a` field now correctly populated on approval (was sending wrong key `account_type`)
- **Approval SMS** — role-aware: "player account", "coach account", or "supporter account"
- **Accent stat cards** — colour-coded stat cards on both player and coach dashboards
- **Vercel Analytics** — installed and wired into root layout
- **Git branch** — remote renamed from `master` to `main`; local tracking updated
