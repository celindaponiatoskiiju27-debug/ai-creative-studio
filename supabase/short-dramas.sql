-- AI short-drama projects and editable storyboard shots.
-- Run once in Supabase SQL Editor before deploying the short-drama studio.

create extension if not exists pgcrypto;

create table if not exists public.short_drama_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  premise text not null,
  genre text not null default '电商剧情',
  target_duration integer not null default 30 check (target_duration between 15 and 120),
  characters jsonb not null default '[]'::jsonb,
  status text not null default 'storyboard' check (status in ('storyboard','generating','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.short_drama_shots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.short_drama_projects(id) on delete cascade,
  shot_number integer not null,
  duration integer not null default 5 check (duration between 3 and 15),
  scene text not null,
  shot_type text not null default '中景',
  visual_prompt text not null,
  dialogue text not null default '',
  status text not null default 'draft' check (status in ('draft','queued','generating','completed','failed')),
  video_job_id uuid references public.video_generation_jobs(id) on delete set null,
  output_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, shot_number)
);

create index if not exists short_drama_projects_user_idx on public.short_drama_projects(user_id, created_at desc);
create index if not exists short_drama_shots_project_idx on public.short_drama_shots(project_id, shot_number);

alter table public.short_drama_projects enable row level security;
alter table public.short_drama_shots enable row level security;

drop policy if exists "users can read own drama projects" on public.short_drama_projects;
create policy "users can read own drama projects" on public.short_drama_projects for select using (auth.uid() = user_id);
drop policy if exists "users can read own drama shots" on public.short_drama_shots;
create policy "users can read own drama shots" on public.short_drama_shots for select using (
  exists (select 1 from public.short_drama_projects p where p.id = project_id and p.user_id = auth.uid())
);

revoke insert, update, delete on public.short_drama_projects, public.short_drama_shots from anon, authenticated;
grant select on public.short_drama_projects, public.short_drama_shots to authenticated;
grant all privileges on public.short_drama_projects, public.short_drama_shots to service_role;

