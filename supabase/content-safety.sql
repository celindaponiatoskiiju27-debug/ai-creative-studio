-- Run once in Supabase SQL Editor.
create table if not exists public.content_safety_settings (
  id boolean primary key default true check (id),
  active boolean not null default true,
  custom_blocked_terms text[] not null default '{}',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.content_safety_settings(id) values(true) on conflict(id) do nothing;

create table if not exists public.moderation_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  source text not null,
  category text not null,
  matched_rule text not null,
  content_excerpt text,
  action text not null default 'blocked' check (action in ('blocked','allowed')),
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists moderation_events_created_idx on public.moderation_events(created_at desc);
create index if not exists moderation_events_user_created_idx on public.moderation_events(user_id,created_at desc);
alter table public.content_safety_settings enable row level security;
alter table public.moderation_events enable row level security;

