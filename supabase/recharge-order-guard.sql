-- Run once in Supabase SQL Editor.
-- Keeps only one pending manual recharge order per user.
update public.recharge_orders set status='cancelled' where status='pending' and expires_at < now();

with ranked as (
  select id,row_number() over(partition by user_id order by created_at desc) as position
  from public.recharge_orders where status='pending'
)
update public.recharge_orders set status='cancelled'
where id in (select id from ranked where position > 1);

create unique index if not exists recharge_orders_one_pending_per_user_idx
on public.recharge_orders(user_id) where status='pending';
