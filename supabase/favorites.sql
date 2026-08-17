create extension if not exists pgcrypto;

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_url text not null,
  media_type text not null default 'image' check (media_type in ('image', 'gif', 'video')),
  prompt text,
  created_at timestamptz not null default now(),
  unique(user_id, asset_url)
);

create index if not exists favorites_user_created_idx on public.favorites(user_id, created_at desc);
alter table public.favorites enable row level security;

drop policy if exists "users can read own favorites" on public.favorites;
create policy "users can read own favorites" on public.favorites for select using (auth.uid() = user_id);

drop policy if exists "users can add own favorites" on public.favorites;
create policy "users can add own favorites" on public.favorites for insert with check (auth.uid() = user_id);

drop policy if exists "users can delete own favorites" on public.favorites;
create policy "users can delete own favorites" on public.favorites for delete using (auth.uid() = user_id);
