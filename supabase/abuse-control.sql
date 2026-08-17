-- Run once in Supabase SQL Editor after cost-control.sql.
alter table public.profiles
  add column if not exists generation_blocked_until timestamptz,
  add column if not exists generation_block_reason text;

alter table public.cost_control_settings
  add column if not exists per_user_daily_request_limit integer not null default 50 check (per_user_daily_request_limit >= 0),
  add column if not exists per_user_daily_cost_limit_fen integer not null default 1000 check (per_user_daily_cost_limit_fen >= 0),
  add column if not exists max_pending_per_user integer not null default 2 check (max_pending_per_user >= 1),
  add column if not exists min_interval_seconds integer not null default 8 check (min_interval_seconds >= 0),
  add column if not exists failure_hour_limit integer not null default 10 check (failure_hour_limit >= 0);

create index if not exists usage_records_user_status_created_idx on public.usage_records(user_id,status,created_at desc);

create or replace function public.reserve_generation_budgeted(
  p_user_id uuid, p_credits integer, p_count integer, p_prompt text, p_action text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_settings public.cost_control_settings%rowtype; v_profile public.profiles%rowtype; v_cost integer;
  v_daily integer; v_monthly integer; v_user_daily_cost integer; v_user_daily_count integer;
  v_pending integer; v_failures integer; v_last_created timestamptz;
  v_day_start timestamptz; v_month_start timestamptz;
begin
  select * into v_settings from public.cost_control_settings where id=true for update;
  if not found then raise exception 'COST_CONTROL_NOT_CONFIGURED'; end if;
  select * into v_profile from public.profiles where id=p_user_id for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_profile.generation_blocked_until is not null and v_profile.generation_blocked_until > now() then raise exception 'USER_GENERATION_BLOCKED'; end if;
  if not v_settings.active then raise exception 'GENERATION_PAUSED'; end if;
  if v_settings.disabled_actions ? p_action then raise exception 'ACTION_DISABLED'; end if;
  v_cost := greatest(0, coalesce((v_settings.action_costs ->> p_action)::integer, 0));
  v_day_start := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  v_month_start := date_trunc('month', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  select coalesce(sum(estimated_cost_fen),0) into v_daily from public.usage_records where status in ('pending','completed') and created_at>=v_day_start;
  select coalesce(sum(estimated_cost_fen),0) into v_monthly from public.usage_records where status in ('pending','completed') and created_at>=v_month_start;
  select count(*),coalesce(sum(estimated_cost_fen),0),max(created_at) into v_user_daily_count,v_user_daily_cost,v_last_created from public.usage_records where user_id=p_user_id and created_at>=v_day_start;
  select count(*) into v_pending from public.usage_records where user_id=p_user_id and status='pending';
  select count(*) into v_failures from public.usage_records where user_id=p_user_id and status='failed' and created_at>=now()-interval '1 hour';
  if v_settings.daily_limit_fen>0 and v_daily+v_cost>v_settings.daily_limit_fen then raise exception 'DAILY_BUDGET_REACHED'; end if;
  if v_settings.monthly_limit_fen>0 and v_monthly+v_cost>v_settings.monthly_limit_fen then raise exception 'MONTHLY_BUDGET_REACHED'; end if;
  if v_settings.per_user_daily_request_limit>0 and v_user_daily_count>=v_settings.per_user_daily_request_limit then raise exception 'USER_DAILY_LIMIT_REACHED'; end if;
  if v_settings.per_user_daily_cost_limit_fen>0 and v_user_daily_cost+v_cost>v_settings.per_user_daily_cost_limit_fen then raise exception 'USER_DAILY_COST_REACHED'; end if;
  if v_pending>=v_settings.max_pending_per_user then raise exception 'TOO_MANY_PENDING'; end if;
  if v_settings.min_interval_seconds>0 and v_last_created is not null and v_last_created>now()-make_interval(secs=>v_settings.min_interval_seconds) then raise exception 'TOO_FREQUENT'; end if;
  if v_settings.failure_hour_limit>0 and v_failures>=v_settings.failure_hour_limit then raise exception 'TOO_MANY_FAILURES'; end if;
  update public.profiles set credits=credits-p_credits where id=p_user_id and credits>=p_credits;
  if not found then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into public.usage_records(user_id,image_count,credits,prompt,action,estimated_cost_fen)
  values(p_user_id,p_count,p_credits,left(p_prompt,1000),left(p_action,50),v_cost) returning id into v_id;
  return v_id;
end $$;

