-- /api/stripe/sync fires from the player and coach dashboard homepages on every
-- load where the profile isn't premium. Its own early-exit only covered users who
-- ALREADY are premium, so for the ~90% of the base on the free tier it ran on
-- every single visit: boot the Stripe SDK, stripe.customers.list({ email }), then
-- a stripe.subscriptions.list per match — to conclude "not a subscriber" again.
-- The route's own doc comment claimed it was "called on first dashboard load for
-- each user"; there was no such guard anywhere.
--
-- That made it the hottest Node function on the platform and the bulk of the
-- nodejs share of the Vercel Fluid Active CPU budget (measured 25 Aug 2026:
-- 1h14m of a 4h monthly allowance, alongside 2h48m of middleware).
--
-- This column is the "we already asked Stripe about this person" marker, so the
-- answer is cached instead of re-derived on every page view.
--
-- NULL means never asked. A timestamp means Stripe was asked and had nothing for
-- them; lib/stripeSync.ts owns how long that answer is trusted
-- (STRIPE_SYNC_RECHECK_DAYS). Deliberately a recheck window rather than a one-shot
-- flag: the Stripe webhook is the real path to premium and this route is only the
-- safety net for a subscription created outside it (a migrated Glide subscriber
-- claiming their account late), and a net that never re-casts stops being a net.
--
-- Not stamped when a subscription IS found — that user comes back premium with a
-- stripe_customer_id, which the route's original early-exit already catches.

alter table public.profiles
  add column if not exists stripe_synced_at timestamptz;

comment on column public.profiles.stripe_synced_at is
  'Last time /api/stripe/sync asked Stripe about this user and found no active subscription. NULL = never asked. Trust window lives in lib/stripeSync.ts.';
