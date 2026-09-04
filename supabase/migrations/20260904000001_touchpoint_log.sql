-- touchpoint_log: shared send-frequency ledger across all email/SMS flows.
--
-- Every automated and manual send writes one row here. The broadcast composer
-- (Stage 1 of email independence) queries this table in its dry-run to warn
-- "48 of 200 recipients had an email in the last 24h" before firing.
-- canSendTouch() in lib/touchpoint.ts is the gate function.
--
-- channel: 'email' | 'sms'
-- flow:    identifies the specific automation or send type (see TouchFlow in lib/touchpoint.ts)
--
-- Service-role only — no client access. RLS enabled with no policies so anon
-- and authenticated roles cannot read or write this table.

create table public.touchpoint_log (
  id           uuid        primary key default gen_random_uuid(),
  recipient_id uuid        not null references public.profiles(id) on delete cascade,
  channel      text        not null check (channel in ('email', 'sms')),
  flow         text        not null,
  sent_at      timestamptz not null default now()
);

-- Primary access pattern: "did this recipient get an email/SMS in the last N hours?"
create index touchpoint_log_recipient_channel_sent
  on public.touchpoint_log (recipient_id, channel, sent_at desc);

-- Bulk dry-run pattern: "how many of these recipient IDs had a touch in window?"
create index touchpoint_log_channel_sent
  on public.touchpoint_log (channel, sent_at desc);

alter table public.touchpoint_log enable row level security;
-- No policies — service-role bypasses RLS. Nothing else should touch this table.
