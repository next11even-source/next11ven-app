-- Game Performance Tracker: player toggle for folding pre-season/friendly
-- matches into season totals, hero stat and insights. NULL = player hasn't
-- chosen yet (auto-resolves to on once they've logged a non-competitive
-- match); true/false once they've explicitly set it, and stays pinned.
alter table profiles
  add column if not exists performance_include_preseason boolean default null;
