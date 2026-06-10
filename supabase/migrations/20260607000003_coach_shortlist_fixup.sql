-- Backfill any null folder_name rows left from before the NOT NULL default was set
update coach_saved_players set folder_name = 'Shortlist' where folder_name is null;

-- Ensure the column has a default and is not null going forward
alter table coach_saved_players alter column folder_name set default 'Shortlist';
alter table coach_saved_players alter column folder_name set not null;
