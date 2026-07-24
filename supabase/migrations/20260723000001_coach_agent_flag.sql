-- Agent designation: a coach flagged as an agent (admin-toggled).
-- Agents keep every coach ability EXCEPT initiating a conversation with
-- another coach (enforced in /api/messages/send). Reversible per-coach.
alter table profiles
  add column if not exists is_agent boolean not null default false;

-- Partial index — agents are a small subset; only index the true rows.
create index if not exists idx_profiles_is_agent
  on profiles (is_agent) where is_agent = true;
