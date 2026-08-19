-- Persistent video/GIF generation queue.
-- Run this file once in the Supabase SQL Editor before deploying the matching server code.

create extension if not exists pgcrypto;

create table if not exists public.video_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_id uuid not null unique references public.usage_records(id) on delete cascade,
  mode text not null check (mode in ('image', 'text')),
  output_format text not null check (output_format in ('gif', 'mp4')),
  prompt text not null,
  ratio text not null default '16:9',
  model_id text not null,
  input_path text,
  input_mime text,
  status text not null default 'queued' check (status in ('queued', 'processing', 'converting', 'completed', 'failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  output_urls text[] not null default '{}',
  error_message text,
  attempts integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_generation_jobs_queue_idx
  on public.video_generation_jobs(status, created_at);
create index if not exists video_generation_jobs_user_idx
  on public.video_generation_jobs(user_id, created_at desc);

alter table public.video_generation_jobs enable row level security;
drop policy if exists "users can read own video jobs" on public.video_generation_jobs;
create policy "users can read own video jobs" on public.video_generation_jobs
  for select using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generation-inputs', 'generation-inputs', false, 10485760, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.claim_video_generation_job()
returns setof public.video_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  select id into v_id
  from public.video_generation_jobs
  where attempts < 3
    and status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if v_id is null then return; end if;

  return query
  update public.video_generation_jobs
  set status = 'processing', progress = 10, attempts = attempts + 1,
      started_at = coalesce(started_at, now()), updated_at = now(), error_message = null
  where id = v_id and attempts < 3
  returning *;
end;
$$;

revoke all on table public.video_generation_jobs from anon, authenticated;
grant select on table public.video_generation_jobs to authenticated;
grant all privileges on table public.video_generation_jobs to service_role;
revoke execute on function public.claim_video_generation_job() from public, anon, authenticated;
grant execute on function public.claim_video_generation_job() to service_role;
