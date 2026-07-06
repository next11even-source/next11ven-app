-- Game Performance Tracker: penalty saves per match (goalkeeper brag stat)

alter table performance_matches
  add column if not exists penalty_saves smallint not null default 0
  check (penalty_saves >= 0 and penalty_saves <= 5);
