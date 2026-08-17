create extension if not exists pgcrypto;

alter table public.profiles add column if not exists referral_code text;
alter table public.profiles alter column referral_code set default upper(substr(md5(gen_random_uuid()::text), 1, 8));
update public.profiles set referral_code = upper(substr(replace(id::text, '-', ''), 1, 8)) where referral_code is null;
create unique index if not exists profiles_referral_code_idx on public.profiles(referral_code);

create table if not exists public.referral_settings (
  id boolean primary key default true check (id),
  active boolean not null default true,
  inviter_reward integer not null default 3 check (inviter_reward >= 0),
  invitee_reward integer not null default 2 check (invitee_reward >= 0),
  monthly_budget integer not null default 500 check (monthly_budget >= 0),
  per_inviter_monthly_limit integer not null default 10 check (per_inviter_monthly_limit >= 0),
  updated_at timestamptz not null default now()
);
insert into public.referral_settings(id) values(true) on conflict(id) do nothing;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null unique references auth.users(id) on delete cascade,
  invite_code text not null,
  status text not null default 'pending' check (status in ('pending','rewarded','budget_limited','disabled')),
  inviter_reward integer not null default 0,
  invitee_reward integer not null default 0,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (inviter_id <> invitee_id)
);
create index if not exists referrals_inviter_created_idx on public.referrals(inviter_id, created_at desc);
alter table public.referrals enable row level security;
drop policy if exists "users can read related referrals" on public.referrals;
create policy "users can read related referrals" on public.referrals for select using (auth.uid() = inviter_id or auth.uid() = invitee_id);

create or replace function public.complete_referral_reward(p_usage_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid; v_ref public.referrals%rowtype; v_settings public.referral_settings%rowtype;
  v_completed integer; v_inviter_count integer; v_month_spent integer; v_month_start timestamptz;
begin
  select user_id into v_user from public.usage_records where id = p_usage_id and status = 'completed';
  if v_user is null then return; end if;
  select count(*) into v_completed from public.usage_records where user_id = v_user and status = 'completed' and action <> 'prompt_enhance';
  if v_completed <> 1 then return; end if;
  select * into v_ref from public.referrals where invitee_id = v_user and status = 'pending' for update;
  if not found then return; end if;
  select * into v_settings from public.referral_settings where id = true;
  if not found or not v_settings.active then update public.referrals set status='disabled' where id=v_ref.id; return; end if;
  v_month_start := date_trunc('month', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  select count(*) into v_inviter_count from public.referrals where inviter_id=v_ref.inviter_id and status='rewarded' and rewarded_at >= v_month_start;
  select coalesce(sum(inviter_reward + invitee_reward),0) into v_month_spent from public.referrals where status='rewarded' and rewarded_at >= v_month_start;
  if v_inviter_count >= v_settings.per_inviter_monthly_limit or v_month_spent + v_settings.inviter_reward + v_settings.invitee_reward > v_settings.monthly_budget then
    update public.referrals set status='budget_limited' where id=v_ref.id; return;
  end if;
  update public.profiles set credits=credits+v_settings.inviter_reward where id=v_ref.inviter_id;
  update public.profiles set credits=credits+v_settings.invitee_reward where id=v_ref.invitee_id;
  update public.referrals set status='rewarded', inviter_reward=v_settings.inviter_reward, invitee_reward=v_settings.invitee_reward, rewarded_at=now() where id=v_ref.id;
end $$;
