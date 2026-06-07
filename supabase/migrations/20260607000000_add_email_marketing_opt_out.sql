alter table profiles
add column if not exists email_marketing_opt_out boolean not null default false;
