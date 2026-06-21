-- Add actively_looking toggle for premium player visibility
ALTER TABLE profiles
  ADD COLUMN actively_looking boolean NOT NULL DEFAULT false;

-- Seed: existing premium free agents get it ON so the carousel launches populated
UPDATE profiles
  SET actively_looking = true
  WHERE premium = true AND status = 'free_agent';
