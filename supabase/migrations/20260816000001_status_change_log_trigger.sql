-- status_change_log already exists in the schema (id, player_id, previous_status,
-- new_status, changed_at) but nothing has ever written to it — profiles.status is
-- a snapshot with no history. This is the source data the analytics rebuild needs
-- for the "signed this month" outcome metric (Layer 2/4). Mirrors the security
-- definer trigger pattern already used for notify_shortlist_availability, since
-- profiles.status is sometimes updated directly from the client (not just through
-- /api/player/status-change), so the insert must bypass RLS regardless of caller.

create or replace function log_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into status_change_log (player_id, previous_status, new_status, changed_at)
  values (NEW.id, OLD.status, NEW.status, now());

  return NEW;
end;
$$;

create trigger trg_log_status_change
  after update of status on profiles
  for each row
  when (NEW.status is distinct from OLD.status)
  execute function log_status_change();
