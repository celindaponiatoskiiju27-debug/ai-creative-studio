alter table public.recharge_orders add column if not exists payment_proof_url text;
alter table public.recharge_orders add column if not exists payment_proof_path text;
alter table public.recharge_orders add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');
alter table public.recharge_orders add column if not exists refunded_credits integer not null default 0 check (refunded_credits >= 0);
update public.credit_packages set active=false,recommended=false where price_fen > 2990;
update public.payment_settings set instructions='当前为小额内测人工充值。请核对套餐金额，付款后填写单号并上传截图；未使用算力可申请退款，已消耗及赠送算力不折现。',updated_at=now() where id='default';
alter table public.recharge_orders drop constraint if exists recharge_orders_status_check;
alter table public.recharge_orders add constraint recharge_orders_status_check check (status in ('pending','paid','rejected','cancelled','partially_refunded','refunded'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-proofs','payment-proofs',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/png','image/jpeg','image/webp'];

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.recharge_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  requested_credits integer not null check (requested_credits > 0),
  requested_amount_fen integer not null check (requested_amount_fen > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  refund_proof_url text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists refund_one_pending_per_order_idx on public.refund_requests(order_id) where status='pending';
create index if not exists refund_requests_created_idx on public.refund_requests(created_at desc);
alter table public.refund_requests enable row level security;
drop policy if exists "users read own refunds" on public.refund_requests;
create policy "users read own refunds" on public.refund_requests for select using(auth.uid()=user_id);

create or replace function public.admin_review_refund(p_admin_id uuid,p_refund_id uuid,p_approve boolean,p_admin_note text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare v_ref refund_requests%rowtype; v_order recharge_orders%rowtype; v_balance integer;
begin
  if not exists(select 1 from profiles where id=p_admin_id and is_admin=true) then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_ref from refund_requests where id=p_refund_id for update;
  if not found then raise exception 'REFUND_NOT_FOUND'; end if;
  if v_ref.status <> 'pending' then raise exception 'REFUND_ALREADY_REVIEWED'; end if;
  if not p_approve then update refund_requests set status='rejected',admin_note=p_admin_note,reviewed_by=p_admin_id,reviewed_at=now() where id=p_refund_id; select credits into v_balance from profiles where id=v_ref.user_id; return v_balance; end if;
  select * into v_order from recharge_orders where id=v_ref.order_id for update;
  update profiles set credits=credits-v_ref.requested_credits where id=v_ref.user_id and credits>=v_ref.requested_credits returning credits into v_balance;
  if v_balance is null then raise exception 'INSUFFICIENT_REFUNDABLE_CREDITS'; end if;
  update recharge_orders set refunded_credits=refunded_credits+v_ref.requested_credits,status=case when refunded_credits+v_ref.requested_credits>=credits then 'refunded' else 'partially_refunded' end where id=v_order.id;
  update refund_requests set status='approved',admin_note=p_admin_note,reviewed_by=p_admin_id,reviewed_at=now() where id=p_refund_id;
  insert into credit_transactions(user_id,type,amount,balance_after,reference_type,reference_id,description) values(v_ref.user_id,'refund',-v_ref.requested_credits,v_balance,'refund_request',v_ref.id,'现金退款扣回算力');
  return v_balance;
end $$;
