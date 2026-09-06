-- email_events: stores one row per Resend webhook event.
-- Used exclusively for email analytics — never for gating or triggering sends.
-- Service-role only: no client access.

create table public.email_events (
  id            uuid        primary key default gen_random_uuid(),
  resend_email_id text      not null,
  event_type    text        not null,
  flow          text,
  recipient_id  uuid        references public.profiles(id),
  occurred_at   timestamptz not null default now(),
  raw           jsonb       not null default '{}'::jsonb
);

create index email_events_resend_email_id_idx on public.email_events(resend_email_id);
create index email_events_flow_idx            on public.email_events(flow);
create index email_events_occurred_at_idx     on public.email_events(occurred_at);
create index email_events_event_type_idx      on public.email_events(event_type);

-- Service-role only. Never expose this table to anon or authenticated clients.
revoke all on public.email_events from anon, authenticated;
grant all on public.email_events to service_role;
