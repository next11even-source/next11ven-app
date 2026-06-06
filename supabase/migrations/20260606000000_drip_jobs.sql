create table if not exists drip_jobs (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references profiles(id) on delete cascade,
  message_id uuid not null references messages(id) on delete cascade,
  sequence_step int not null check (sequence_step in (1, 2, 3)),
  send_at timestamptz not null,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index drip_jobs_pending_idx on drip_jobs(send_at) where sent = false;
create index drip_jobs_recipient_idx on drip_jobs(recipient_id, created_at);
