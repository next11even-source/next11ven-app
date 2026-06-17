-- Normalize playing_level: strip legacy Glide descriptions, map misc values to new valid set.
-- Valid levels after this migration: Step 1-7, U18s/Academy, Wales 1, Wales 2, Other
UPDATE profiles
SET playing_level = CASE
  WHEN playing_level LIKE 'Step 1%' THEN 'Step 1'
  WHEN playing_level LIKE 'Step 2%' THEN 'Step 2'
  WHEN playing_level LIKE 'Step 3%' THEN 'Step 3'
  WHEN playing_level LIKE 'Step 4%' THEN 'Step 4'
  WHEN playing_level LIKE 'Step 5%' THEN 'Step 5'
  WHEN playing_level LIKE 'Step 6%' THEN 'Step 6'
  WHEN playing_level LIKE 'Step 7%' THEN 'Step 7'
  WHEN playing_level = 'U18''s/Academy'                             THEN 'U18s/Academy'
  WHEN playing_level IN ('Other', 'Other/Playing Abroad', 'International League') THEN 'Other'
  WHEN playing_level = 'Wales (2nd Tier)'                           THEN 'Wales 2'
  ELSE NULL
END
WHERE playing_level IS NOT NULL
  AND playing_level NOT IN ('Step 1','Step 2','Step 3','Step 4','Step 5','Step 6','Step 7','U18s/Academy','Wales 1','Wales 2','Other');

-- Normalize coaching_level: same treatment.
-- Welsh Leagues mapped to NULL — cannot determine Wales 1 vs Wales 2 tier.
UPDATE profiles
SET coaching_level = CASE
  WHEN coaching_level LIKE 'Step 1%' THEN 'Step 1'
  WHEN coaching_level LIKE 'Step 2%' THEN 'Step 2'
  WHEN coaching_level LIKE 'Step 3%' THEN 'Step 3'
  WHEN coaching_level LIKE 'Step 4%' THEN 'Step 4'
  WHEN coaching_level LIKE 'Step 5%' THEN 'Step 5'
  WHEN coaching_level LIKE 'Step 6%' THEN 'Step 6'
  WHEN coaching_level LIKE 'Step 7%' THEN 'Step 7'
  WHEN coaching_level = 'Other'                                     THEN 'Other'
  ELSE NULL
END
WHERE coaching_level IS NOT NULL
  AND coaching_level NOT IN ('Step 1','Step 2','Step 3','Step 4','Step 5','Step 6','Step 7','U18s/Academy','Wales 1','Wales 2','Other');
