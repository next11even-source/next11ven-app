-- Add league (competition name) to opportunities.
-- Stored as free text from a curated dropdown (lib/leagues.ts) rather than a
-- FK to a separate leagues table — no images, no admin management overhead,
-- just a clean text label that shows in the card meta line and enables
-- filtering once coaches start filling it in.
-- Coaches pick from a step-filtered list when posting; admins can set/correct
-- it via the moderation edit form. Nullable: existing and future opportunities
-- where the coach doesn't pick a league stay null and the field is omitted.

alter table public.opportunities
  add column if not exists league text;

comment on column public.opportunities.league is
  'Competition name picked from lib/leagues.ts at post time (e.g. "Northern Premier League Division One West"). Null when the coach did not specify.';
