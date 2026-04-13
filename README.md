# NEXT11VEN App

Custom recruitment platform for non-league football. Connects players with coaches and clubs. Replacing a Glide no-code app — solo founder build.

## Tech Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4
- Supabase (PostgreSQL + Auth + Storage)
- Stripe (not yet integrated)
- Twilio SMS (wired, env vars needed)
- MailerLite (not yet integrated)

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
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
MAILERLITE_API_KEY
```

## Key decisions

- Single `profiles` table for all roles — `player_profiles` and `coach_profiles` exist but are **orphaned, do not use them**
- Role values: `player` | `coach` | `admin`
- `admin` role users also appear in player lists (founder is both)
- `approved` boolean + `approval_status` text column (pending/approved/declined) — admin must approve new signups
- Premium stored as boolean on `profiles`
- Auth flow: sign in → middleware checks `approved` + `role` → redirects to correct dashboard
- Status values: `free_agent` | `signed` | `loan_dual_reg` | `just_exploring`
