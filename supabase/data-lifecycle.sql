-- Run once in Supabase SQL Editor.
create table if not exists public.data_lifecycle_settings (
  id boolean primary key default true check (id),
  generated_asset_days integer not null default 90 check (generated_asset_days between 7 and 3650),
  closed_support_days integer not null default 365 check (closed_support_days between 30 and 3650),
  last_cleanup_at timestamptz,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.data_lifecycle_settings(id) values(true) on conflict(id) do nothing;
alter table public.data_lifecycle_settings enable row level security;

