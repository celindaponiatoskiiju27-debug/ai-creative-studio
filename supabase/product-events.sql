-- Run once in Supabase SQL Editor.
create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  anonymous_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('page_view','onboarding_view','onboarding_start','template_select','login_prompt','generation_success','recharge_open','recharge_order')),
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists product_events_type_created_idx on public.product_events(event_type,created_at desc);
create index if not exists product_events_anonymous_created_idx on public.product_events(anonymous_id,created_at desc);
alter table public.product_events enable row level security;

