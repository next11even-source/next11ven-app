-- Normalise all existing phone numbers to E.164 format (+447xxxxxxxxx).
-- Handles: 07xxx, +44 7xxx, 447xxx, 0044xxx, 7xxxxxxxxx (10 digits).
-- Unrecognisable formats are set to NULL rather than left as garbage.

UPDATE profiles
SET phone = normalised
FROM (
  SELECT
    id,
    CASE
      -- Strip whitespace/dashes/parens/dots first, then classify
      WHEN regexp_replace(phone, '[\s\-\(\)\.]', '', 'g') ~ '^\+447\d{9}$'
        THEN regexp_replace(phone, '[\s\-\(\)\.]', '', 'g')
      -- 07xxxxxxxxx (11 digits)
      WHEN regexp_replace(phone, '[\s\-\(\)\.]', '', 'g') ~ '^07\d{9}$'
        THEN '+44' || substring(regexp_replace(phone, '[\s\-\(\)\.]', '', 'g') from 2)
      -- 7xxxxxxxxx (10 digits, no leading 0)
      WHEN regexp_replace(phone, '[\s\-\(\)\.]', '', 'g') ~ '^7\d{9}$'
        THEN '+44' || regexp_replace(phone, '[\s\-\(\)\.]', '', 'g')
      -- 447xxxxxxxxx (12 digits, country code without +)
      WHEN regexp_replace(phone, '[\s\-\(\)\.]', '', 'g') ~ '^447\d{9}$'
        THEN '+' || regexp_replace(phone, '[\s\-\(\)\.]', '', 'g')
      -- 0044 7xxxxxxxxx
      WHEN regexp_replace(phone, '[\s\-\(\)\.]', '', 'g') ~ '^00447\d{9}$'
        THEN '+' || substring(regexp_replace(phone, '[\s\-\(\)\.]', '', 'g') from 3)
      -- +44 with non-mobile digits or other formats — strip spaces and keep
      WHEN phone ~ '^\+44'
        THEN regexp_replace(phone, '[\s\-\(\)\.]', '', 'g')
      -- Unrecognisable — null it out
      ELSE NULL
    END AS normalised
  FROM profiles
  WHERE phone IS NOT NULL
) sub
WHERE profiles.id = sub.id
  AND profiles.phone IS DISTINCT FROM sub.normalised;
