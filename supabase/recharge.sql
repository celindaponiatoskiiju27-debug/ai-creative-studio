-- Run this file once in Supabase SQL Editor.
create table if not exists public.recharge_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_id text not null,
  amount_fen integer not null check (amount_fen > 0),
  credits integer not null check (credits > 0),
  payment_provider text not null default 'manual',
  payment_reference text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'rejected', 'cancelled')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('recharge', 'consume', 'refund', 'admin', 'gift')),
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  reference_type text,
  reference_id uuid,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_settings (
  id text primary key default 'default' check (id = 'default'),
  qr_url text,
  qr_path text,
  instructions text not null default '请扫码支付对应套餐金额，并填写付款备注。管理员核对后算力到账。',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.payment_settings(id) values ('default') on conflict (id) do nothing;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('payment-assets', 'payment-assets', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880, allowed_mime_types=array['image/png','image/jpeg','image/webp'];

create index if not exists recharge_orders_user_created_idx on public.recharge_orders(user_id, created_at desc);
create index if not exists recharge_orders_status_created_idx on public.recharge_orders(status, created_at desc);
create unique index if not exists recharge_orders_one_paid_trial_idx on public.recharge_orders(user_id, package_id) where package_id = 'trial' and status = 'paid';
create index if not exists credit_transactions_user_created_idx on public.credit_transactions(user_id, created_at desc);
alter table public.recharge_orders enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.payment_settings enable row level security;
drop policy if exists "users can read own recharge orders" on public.recharge_orders;
create policy "users can read own recharge orders" on public.recharge_orders for select using (auth.uid() = user_id);
drop policy if exists "users can read own credit transactions" on public.credit_transactions;
create policy "users can read own credit transactions" on public.credit_transactions for select using (auth.uid() = user_id);
drop policy if exists "anyone can read payment settings" on public.payment_settings;
create policy "anyone can read payment settings" on public.payment_settings for select using (true);

create or replace function public.admin_review_recharge(p_admin_id uuid, p_order_id uuid, p_approve boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare v_order recharge_orders%rowtype; v_balance integer;
begin
  if not exists (select 1 from profiles where id = p_admin_id and is_admin = true) then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_order from recharge_orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.status <> 'pending' then raise exception 'ORDER_ALREADY_REVIEWED'; end if;
  if not p_approve then
    update recharge_orders set status='rejected', reviewed_by=p_admin_id, reviewed_at=now() where id=p_order_id;
    select credits into v_balance from profiles where id=v_order.user_id;
    return v_balance;
  end if;
  update profiles set credits=credits+v_order.credits where id=v_order.user_id returning credits into v_balance;
  update recharge_orders set status='paid', reviewed_by=p_admin_id, reviewed_at=now(), paid_at=now() where id=p_order_id;
  insert into credit_transactions(user_id,type,amount,balance_after,reference_type,reference_id,description)
  values(v_order.user_id,'recharge',v_order.credits,v_balance,'recharge_order',v_order.id,'充值订单到账');
  return v_balance;
end;
$$;
