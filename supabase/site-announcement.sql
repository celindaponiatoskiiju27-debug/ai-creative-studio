-- Run once in Supabase SQL Editor.
create table if not exists public.site_announcements (
  id boolean primary key default true check (id),
  active boolean not null default false,
  level text not null default 'info' check (level in ('info','warning','critical','success')),
  title text not null default '',
  content text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.site_announcements(id) values(true) on conflict(id) do nothing;
alter table public.site_announcements enable row level security;
revoke all on table public.site_announcements from anon,authenticated;
grant all on table public.site_announcements to service_role;
