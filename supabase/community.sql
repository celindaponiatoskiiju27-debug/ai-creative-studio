-- 灵感广场：在 Supabase SQL Editor 中完整执行一次。
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_id uuid not null references public.usage_records(id) on delete cascade,
  asset_url text not null,
  media_type text not null check (media_type in ('image','gif','video')),
  title text not null check (char_length(title) between 1 and 80),
  category text not null default '其他',
  prompt_visibility text not null default 'full' check (prompt_visibility in ('full','remix_only','hidden')),
  prompt text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','removed')),
  review_reason text,
  view_count integer not null default 0 check (view_count >= 0),
  favorite_count integer not null default 0 check (favorite_count >= 0),
  remix_count integer not null default 0 check (remix_count >= 0),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, usage_id, asset_url)
);
create table if not exists public.community_favorites (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(post_id,user_id)
);
create table if not exists public.community_reports (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  created_at timestamptz not null default now(), unique(post_id,user_id)
);
create table if not exists public.community_remixes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(post_id,user_id)
);
create index if not exists community_posts_feed_idx on public.community_posts(status,created_at desc);
create index if not exists community_posts_category_idx on public.community_posts(status,category,created_at desc);
create index if not exists community_reports_status_idx on public.community_reports(status,created_at desc);
alter table public.community_posts enable row level security;
alter table public.community_favorites enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_remixes enable row level security;
revoke all on public.community_posts,public.community_favorites,public.community_reports,public.community_remixes from anon,authenticated;
grant all on public.community_posts,public.community_favorites,public.community_reports,public.community_remixes to service_role;
grant usage,select on sequence public.community_reports_id_seq to service_role;
