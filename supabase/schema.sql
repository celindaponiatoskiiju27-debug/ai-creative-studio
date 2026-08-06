create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  credits integer not null default 10 check (credits >= 0),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null default 'image_generation',
  image_count integer not null,
  credits integer not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  prompt text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.usage_records enable row level security;

create table if not exists public.signup_credit_grants (
  email text primary key,
  granted_at timestamptz not null default now()
);

alter table public.signup_credit_grants enable row level security;

create policy "users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "users can read own usage" on public.usage_records for select using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_granted integer := 0;
begin
  insert into public.signup_credit_grants (email)
  values (lower(new.email))
  on conflict (email) do nothing;
  if found then v_granted := 10; end if;
  insert into public.profiles (id, email, credits) values (new.id, new.email, v_granted);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.reserve_generation(p_user_id uuid, p_credits integer, p_count integer, p_prompt text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update profiles set credits = credits - p_credits where id = p_user_id and credits >= p_credits;
  if not found then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into usage_records(user_id, image_count, credits, prompt)
  values (p_user_id, p_count, p_credits, left(p_prompt, 1000)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finish_generation(p_usage_id uuid, p_success boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_row usage_records%rowtype;
begin
  update usage_records set status = case when p_success then 'completed' else 'failed' end
  where id = p_usage_id and status = 'pending' returning * into v_row;
  if found and not p_success then update profiles set credits = credits + v_row.credits where id = v_row.user_id; end if;
end;
$$;
