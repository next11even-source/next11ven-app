-- Layer 2 marketplace health — explains WHY the hero numbers moved. Response
-- rate and conversation engagement use a rolling 30-day window rather than
-- calendar-month: a rate metric restricted to "this month so far" would be
-- badly biased early in the month (few applications, all too recent to have
-- been answered yet) — the same MTD trap fixed for the hero row, but for a
-- rate this manifests as a fake dip every month, not just a fake decline.
-- Outcomes (accepted/signed) stay calendar-month, matching the hero row's own
-- framing for flow/count metrics.
--
-- "Signed" will read near-zero for a while — status_change_log only started
-- accruing history on 16 Aug 2026 (see 20260816000001). That's an honest
-- zero, not a bug.

create or replace function analytics_marketplace_health()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, stripe, auth
as $$
declare
  v_result jsonb;
  v_month_start timestamptz := date_trunc('month', now());
begin
  select jsonb_build_object(

    'application_response_rate', (
      select jsonb_build_object(
        'responded', count(*) filter (where status in ('accepted', 'rejected')),
        'total', count(*),
        'rate_pct', case when count(*) = 0 then null
          else round(count(*) filter (where status in ('accepted', 'rejected')) * 100.0 / count(*))::int
        end
      )
      from applications
      where created_at >= now() - interval '30 days'
    ),

    'conversation_engagement_rate', (
      select jsonb_build_object(
        'engaged', count(*) filter (where msg_count >= 2),
        'total', count(*),
        'rate_pct', case when count(*) = 0 then null
          else round(count(*) filter (where msg_count >= 2) * 100.0 / count(*))::int
        end
      )
      from (
        select c.id, count(m.id) as msg_count
        from conversations c
        left join messages m on m.conversation_id = c.id
        where c.created_at >= now() - interval '30 days'
        group by c.id
      ) convo_msg_counts
    ),

    'outcomes', jsonb_build_object(
      'accepted', coalesce((
        select count(*)::int from notifications
        where type = 'application_decision' and created_at >= v_month_start
      ), 0),
      'signed', coalesce((
        select count(*)::int from status_change_log
        where new_status = 'signed' and changed_at >= v_month_start
      ), 0)
    ),

    'wau', jsonb_build_object(
      'player', coalesce((
        select count(distinct p.id)::int
        from profiles p join auth.users au on au.id = p.id
        where p.approval_status = 'approved' and p.role in ('player', 'admin')
          and au.last_sign_in_at >= now() - interval '7 days'
      ), 0),
      'coach', coalesce((
        select count(distinct p.id)::int
        from profiles p join auth.users au on au.id = p.id
        where p.approval_status = 'approved' and p.role = 'coach'
          and au.last_sign_in_at >= now() - interval '7 days'
      ), 0)
    ),

    'dau', jsonb_build_object(
      'player', coalesce((
        select count(distinct p.id)::int
        from profiles p join auth.users au on au.id = p.id
        where p.approval_status = 'approved' and p.role in ('player', 'admin')
          and au.last_sign_in_at >= now() - interval '1 day'
      ), 0),
      'coach', coalesce((
        select count(distinct p.id)::int
        from profiles p join auth.users au on au.id = p.id
        where p.approval_status = 'approved' and p.role = 'coach'
          and au.last_sign_in_at >= now() - interval '1 day'
      ), 0)
    )

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_marketplace_health() to service_role;
