alter table profiles
  add column if not exists showcase_confirmed boolean not null default false,
  add column if not exists showcase_confirmed_at timestamptz;
