-- broadcast_logs: audit trail for admin-composed broadcast emails.
-- One row per broadcast sent from /dashboard/admin/broadcast.
-- Service-role only — admin reads go through API routes, never direct client access.

create table public.broadcast_logs (
  id              uuid        primary key default gen_random_uuid(),
  created_by      uuid        not null references public.profiles(id),
  subject         text        not null,
  audience_filter jsonb       not null,
  recipient_count int         not null default 0,
  sent_count      int         not null default 0,
  failed_count    int         not null default 0,
  sent_at         timestamptz not null default now()
);

create index broadcast_logs_sent_at on public.broadcast_logs (sent_at desc);

alter table public.broadcast_logs enable row level security;
-- No policies — service-role bypasses RLS. Nothing client-facing touches this table.
