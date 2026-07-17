-- Stage 2: the ONLY public read path into a player's tracked performance.
--
-- SECURITY DEFINER so a viewer can read another player's rows (owner-only RLS
-- otherwise blocks it) — but the function is the allowlist: it builds its output
-- field-by-field with jsonb_build_object, so notes / tags / rating are NEVER in
-- the payload. `tags` is read ONLY to derive a man_of_the_match boolean and is
-- never itself returned. There is no code path that emits a raw match row.
--
-- Gated on the coarse profile switch: returns {visible:false} unless the target
-- is a player/admin AND performance_stats_public = true.
--
-- CREATE OR REPLACE (not a table change) — safely iterable, per the Stage 1
-- decision to ship read logic with its stage.

create or replace function public_player_performance(p_player_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case
    when not exists (
      select 1 from profiles
      where id = p_player_id
        and role in ('player', 'admin')
        and performance_stats_public = true
    )
    then jsonb_build_object('visible', false)
    else jsonb_build_object(
      'visible', true,
      -- Live log — objective columns only. notes/tags/rating deliberately absent.
      'matches', coalesce((
        select jsonb_agg(jsonb_build_object(
          'match_date',       m.match_date,
          'competition_type', m.competition_type,
          'goals_for',        m.goals_for,
          'goals_against',    m.goals_against,
          'started',          m.started,
          'position',         m.position,
          'minutes_played',   m.minutes_played,
          'goals',            m.goals,
          'assists',          m.assists,
          'penalty_saves',    m.penalty_saves,
          'yellow_cards',     m.yellow_cards,
          'red_card',         m.red_card,
          -- club/level are in the public allowlist (Q1); sourced from the stint.
          'club_name',        s.club_name,
          'club_level',       s.level,
          -- Derived here so the raw tags array never leaves the database.
          'man_of_the_match', ('man_of_the_match' = any(m.tags))
        ) order by m.match_date desc)
        from performance_matches m
        left join club_stints s on s.id = m.stint_id
        where m.player_id = p_player_id
      ), '[]'::jsonb),
      -- Pre-platform history — already objective by construction.
      'career', coalesce((
        select jsonb_agg(jsonb_build_object(
          'season_start_year', c.season_start_year,
          'club_name',         c.club_name,
          'level',             c.level,
          'position',          c.position,
          'apps',              c.apps,
          'goals',             c.goals,
          'assists',           c.assists,
          'minutes',           c.minutes,
          'clean_sheets',      c.clean_sheets,
          'source',            c.source
        ) order by c.season_start_year desc)
        from career_stats c
        where c.player_id = p_player_id
      ), '[]'::jsonb)
    )
  end;
$$;

-- Browse is behind auth in the app; anon has no need to call this.
grant execute on function public_player_performance(uuid) to authenticated;
