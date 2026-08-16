-- Layer 3 dashboard surface: conversion-trigger attribution. Self-calibrating
-- rather than a hardcoded date — "started" is the first REAL row in
-- premium_clicks (i.e. the first paywall actually shown to a live user),
-- not the day this SQL was pushed. The frontend that fires
-- /api/track/premium-intent isn't live yet as of this migration, so a fixed
-- date would start (and could even finish) a calibration window before any
-- real data existed. Basing it on the data itself means the window always
-- reflects when logging genuinely began, whenever that turns out to be.
--
-- 30 days chosen as the calibration period: at current premium-conversion
-- volume (~13-14/month per the hero row), that's roughly a month's worth of
-- attributable upgrades — enough to read a touchpoint breakdown as signal
-- rather than 2-3 data points. Adjust v_days_required if that turns out
-- wrong once real numbers come in.
--
-- Attribution counting: 'converted' rows are per-touchpoint SHOWN-and-later-
-- converted events (the Stripe webhook marks every touchpoint in the
-- preceding 7 days converted=true on a user's first upgrade — see
-- 20260816000001-area work) — a single upgrade can mark multiple touchpoints
-- converted if several were shown in that window, which is intentional: see
-- the attribution-window reasoning in app/api/stripe/webhook/route.ts.
--
-- time_to_upgrade is NOT duplicated here — it already lives in
-- analytics_revenue_stats() and has real historical data with no calibration
-- gap (computed from profiles/subscriptions, not from the new logging), so
-- it ships immediately from its existing home.

create or replace function analytics_conversion_intelligence()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb;
  v_days_required int := 30;
  v_started_at timestamptz;
  v_days_elapsed int;
  v_ready boolean;
begin
  select min(clicked_at) into v_started_at from premium_clicks;

  v_days_elapsed := case when v_started_at is not null
    then floor(extract(epoch from (now() - v_started_at)) / 86400)::int
    else null
  end;

  v_ready := v_started_at is not null and v_days_elapsed >= v_days_required;

  select jsonb_build_object(

    'calibration', jsonb_build_object(
      'ready', v_ready,
      'started_at', v_started_at,
      'days_elapsed', v_days_elapsed,
      'days_required', v_days_required
    ),

    'touchpoints', case when not v_ready then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'touchpoint', touchpoint,
          'shown', shown,
          'converted', converted,
          'conversion_rate_pct', case when shown = 0 then null else round(converted * 100.0 / shown)::int end
        )
        order by converted desc, shown desc
      )
      from (
        select
          touchpoint,
          count(*)::int as shown,
          count(*) filter (where converted)::int as converted
        from premium_clicks
        group by touchpoint
      ) t
    ), '[]'::jsonb) end

  ) into v_result;

  return v_result;
end;
$$;

grant execute on function analytics_conversion_intelligence() to service_role;
