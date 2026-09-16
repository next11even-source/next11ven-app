-- analytics_player_views_monthly()
-- Monthly coach profile-view volume + 7-day view-to-message conversion rate.
--
-- Attribution rule:
--   A view "converts" if the viewing coach sends a message to that player within
--   7 days of the view. We track the existence of any such message in the relevant
--   conversation — not the total message count, which belongs to the Engagement chart.
--
-- Window: 7 days — consistent with the WAU window used elsewhere on this dashboard.
--   A view more than 7 days before a message is a cold outreach, not a conversion.
--
-- Denominator: coach profile views only (viewer_role = 'coach').
--   Player-views-player rows exist but aren't conversion opportunities in this sense;
--   including them would inflate the denominator and make the rate meaninglessly low.
--
-- Launch filter: 2026-04-01 (matches every other monthly series on this dashboard).

CREATE OR REPLACE FUNCTION analytics_player_views_monthly()
RETURNS TABLE (
  label               text,
  views               bigint,
  view_to_message_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH coach_views AS (
    SELECT
      date_trunc('month', pv.viewed_at) AS month,
      pv.viewed_at,
      pv.viewer_id,
      pv.player_id
    FROM player_views pv
    WHERE pv.viewer_role = 'coach'
      AND pv.viewed_at >= '2026-04-01'
  ),
  with_conversion AS (
    SELECT
      cv.month,
      -- Did the coach send a message to this player within 7 days of the view?
      CASE WHEN EXISTS (
        SELECT 1
        FROM conversations c
        JOIN messages m
          ON  m.conversation_id = c.id
          AND m.sender_id        = cv.viewer_id
          AND m.created_at IS NOT NULL
          AND m.created_at >= cv.viewed_at
          AND m.created_at <= cv.viewed_at + INTERVAL '7 days'
        WHERE c.coach_id  = cv.viewer_id
          AND c.player_id = cv.player_id
        LIMIT 1
      ) THEN 1 ELSE 0 END AS converted
    FROM coach_views cv
  )
  SELECT
    to_char(month, 'Mon YY')                                             AS label,
    COUNT(*)                                                             AS views,
    ROUND(SUM(converted)::numeric * 100 / NULLIF(COUNT(*), 0), 1)      AS view_to_message_pct
  FROM with_conversion
  GROUP BY month
  ORDER BY month
$$;

REVOKE ALL ON FUNCTION analytics_player_views_monthly() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analytics_player_views_monthly() TO service_role;
