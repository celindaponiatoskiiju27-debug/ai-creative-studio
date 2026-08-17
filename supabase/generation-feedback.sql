-- Run once in Supabase SQL Editor.
create table if not exists public.generation_feedback (
  id bigint generated always as identity primary key,
  usage_id uuid not null unique references public.usage_records(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  helpful boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists generation_feedback_created_idx on public.generation_feedback(created_at desc);
create index if not exists generation_feedback_user_created_idx on public.generation_feedback(user_id,created_at desc);
alter table public.generation_feedback enable row level security;
revoke all on table public.generation_feedback from anon,authenticated;
grant all on table public.generation_feedback to service_role;
grant usage,select on sequence public.generation_feedback_id_seq to service_role;
