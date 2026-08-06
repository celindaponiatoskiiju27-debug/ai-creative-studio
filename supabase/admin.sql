alter table public.profiles add column if not exists is_admin boolean not null default false;

create table if not exists public.credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text,
  created_at timestamptz not null default now()
);

alter table public.credit_adjustments enable row level security;

create or replace function public.admin_adjust_credits(p_admin_id uuid, p_user_id uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  if not exists (select 1 from profiles where id = p_admin_id and is_admin = true) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  update profiles set credits = credits + p_amount
  where id = p_user_id and credits + p_amount >= 0
  returning credits into v_balance;
  if not found then raise exception 'INVALID_CREDIT_ADJUSTMENT'; end if;
  insert into credit_adjustments(user_id, admin_id, amount, reason)
  values (p_user_id, p_admin_id, p_amount, left(coalesce(p_reason, ''), 200));
  return v_balance;
end;
$$;

-- 注册并验证邮箱后，将下面的邮箱换成你的管理员邮箱并执行一次：
-- update public.profiles set is_admin = true where email = 'your-admin@example.com';

