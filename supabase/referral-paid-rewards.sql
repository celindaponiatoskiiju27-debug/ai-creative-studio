-- Run once in Supabase SQL Editor. Replaces the old "first generation" reward.
alter table public.profiles add column if not exists registration_ip text;
alter table public.referral_settings add column if not exists per_inviter_daily_limit integer not null default 3 check (per_inviter_daily_limit >= 0);
alter table public.referrals add column if not exists qualification_order_id uuid references public.recharge_orders(id);
alter table public.referrals add column if not exists review_reason text;

alter table public.referrals drop constraint if exists referrals_status_check;
alter table public.referrals add constraint referrals_status_check check (status in ('pending','rewarded','budget_limited','disabled','rejected'));

-- Keep the legacy RPC harmless while older app instances are being replaced.
create or replace function public.complete_referral_reward(p_usage_id uuid)
returns void language plpgsql security definer set search_path = public as $$ begin return; end $$;

create or replace function public.complete_referral_payment(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.recharge_orders%rowtype; v_ref public.referrals%rowtype; v_settings public.referral_settings%rowtype;
  v_inviter_ip text; v_invitee_ip text; v_daily_count integer; v_monthly_count integer; v_month_spent integer;
  v_day_start timestamptz; v_month_start timestamptz; v_inviter_balance integer; v_invitee_balance integer;
begin
  select * into v_order from public.recharge_orders where id=p_order_id and status='paid' for update;
  if not found then return; end if;
  if (select count(*) from public.recharge_orders where user_id=v_order.user_id and status in ('paid','partially_refunded','refunded')) <> 1 then return; end if;
  select * into v_ref from public.referrals where invitee_id=v_order.user_id and status='pending' for update;
  if not found then return; end if;
  select * into v_settings from public.referral_settings where id=true;
  if not found or not v_settings.active then update public.referrals set status='disabled',review_reason='活动已关闭' where id=v_ref.id; return; end if;

  select registration_ip into v_inviter_ip from public.profiles where id=v_ref.inviter_id;
  select registration_ip into v_invitee_ip from public.profiles where id=v_ref.invitee_id;
  if v_inviter_ip is not null and v_invitee_ip is not null and v_inviter_ip=v_invitee_ip then
    update public.referrals set status='rejected',qualification_order_id=p_order_id,review_reason='邀请人与新用户注册 IP 相同' where id=v_ref.id; return;
  end if;
  if coalesce(v_order.payment_reference,'') <> '' and exists(select 1 from public.recharge_orders where user_id=v_ref.inviter_id and payment_reference=v_order.payment_reference and status in ('paid','partially_refunded','refunded')) then
    update public.referrals set status='rejected',qualification_order_id=p_order_id,review_reason='邀请人与新用户使用了相同付款凭证' where id=v_ref.id; return;
  end if;

  v_day_start := date_trunc('day',now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  v_month_start := date_trunc('month',now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  select count(*) into v_daily_count from public.referrals where inviter_id=v_ref.inviter_id and status='rewarded' and rewarded_at>=v_day_start;
  select count(*) into v_monthly_count from public.referrals where inviter_id=v_ref.inviter_id and status='rewarded' and rewarded_at>=v_month_start;
  select coalesce(sum(inviter_reward+invitee_reward),0) into v_month_spent from public.referrals where status='rewarded' and rewarded_at>=v_month_start;
  if v_daily_count>=v_settings.per_inviter_daily_limit or v_monthly_count>=v_settings.per_inviter_monthly_limit or v_month_spent+v_settings.inviter_reward+v_settings.invitee_reward>v_settings.monthly_budget then
    update public.referrals set status='budget_limited',qualification_order_id=p_order_id,review_reason='已达到邀请奖励预算上限' where id=v_ref.id; return;
  end if;

  update public.profiles set credits=credits+v_settings.inviter_reward where id=v_ref.inviter_id returning credits into v_inviter_balance;
  update public.profiles set credits=credits+v_settings.invitee_reward where id=v_ref.invitee_id returning credits into v_invitee_balance;
  update public.referrals set status='rewarded',inviter_reward=v_settings.inviter_reward,invitee_reward=v_settings.invitee_reward,rewarded_at=now(),qualification_order_id=p_order_id,review_reason=null where id=v_ref.id;
  insert into public.credit_transactions(user_id,type,amount,balance_after,reference_type,reference_id,description) values
    (v_ref.inviter_id,'gift',v_settings.inviter_reward,v_inviter_balance,'referral',v_ref.id,'邀请真实新用户首次付费奖励'),
    (v_ref.invitee_id,'gift',v_settings.invitee_reward,v_invitee_balance,'referral',v_ref.id,'通过邀请注册并首次付费奖励');
end $$;

revoke execute on function public.complete_referral_payment(uuid) from public,anon,authenticated;
grant execute on function public.complete_referral_payment(uuid) to service_role;
