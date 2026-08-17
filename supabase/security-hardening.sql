-- Run once in Supabase SQL Editor after all other project SQL files.
-- The browser only talks to the Node.js API. Sensitive tables and RPC functions
-- therefore stay available to service_role, but cannot be called directly with
-- the public publishable/anon key.

revoke execute on function public.reserve_generation(uuid, integer, integer, text) from public, anon, authenticated;
revoke execute on function public.finish_generation(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.reserve_generation_budgeted(uuid, integer, integer, text, text) from public, anon, authenticated;
revoke execute on function public.complete_referral_reward(uuid) from public, anon, authenticated;
revoke execute on function public.admin_review_recharge(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_review_refund(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.admin_adjust_credits(uuid, uuid, integer, text) from public, anon, authenticated;

grant execute on function public.reserve_generation(uuid, integer, integer, text) to service_role;
grant execute on function public.finish_generation(uuid, boolean) to service_role;
grant execute on function public.reserve_generation_budgeted(uuid, integer, integer, text, text) to service_role;
grant execute on function public.complete_referral_reward(uuid) to service_role;
grant execute on function public.admin_review_recharge(uuid, uuid, boolean) to service_role;
grant execute on function public.admin_review_refund(uuid, uuid, boolean, text) to service_role;
grant execute on function public.admin_adjust_credits(uuid, uuid, integer, text) to service_role;

-- Direct writes must go through the authenticated Node.js backend.
revoke insert, update, delete, truncate, references, trigger on table
  public.profiles,
  public.usage_records,
  public.signup_credit_grants,
  public.recharge_orders,
  public.credit_transactions,
  public.payment_settings,
  public.credit_packages,
  public.refund_requests,
  public.credit_adjustments,
  public.referral_settings,
  public.referrals,
  public.support_conversations,
  public.support_messages,
  public.user_consents,
  public.product_events,
  public.cost_control_settings,
  public.data_lifecycle_settings,
  public.content_safety_settings,
  public.moderation_events
from anon, authenticated;

grant all privileges on table
  public.profiles,
  public.usage_records,
  public.signup_credit_grants,
  public.recharge_orders,
  public.credit_transactions,
  public.payment_settings,
  public.credit_packages,
  public.refund_requests,
  public.credit_adjustments,
  public.referral_settings,
  public.referrals,
  public.support_conversations,
  public.support_messages,
  public.user_consents,
  public.product_events,
  public.cost_control_settings,
  public.data_lifecycle_settings,
  public.content_safety_settings,
  public.moderation_events
to service_role;

grant usage, select on all sequences in schema public to service_role;

