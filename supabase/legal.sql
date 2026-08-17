create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check(document_type in ('terms','privacy','refund','ai_rules')),
  document_version text not null,
  ip_address text,
  user_agent text,
  accepted_at timestamptz not null default now(),
  unique(user_id,document_type,document_version)
);
create index if not exists user_consents_user_idx on public.user_consents(user_id,accepted_at desc);
alter table public.user_consents enable row level security;
drop policy if exists "users read own consents" on public.user_consents;
create policy "users read own consents" on public.user_consents for select using(auth.uid()=user_id);

alter table public.recharge_orders add column if not exists terms_version text;
alter table public.recharge_orders add column if not exists terms_accepted_at timestamptz;
