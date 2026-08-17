-- Run once in Supabase SQL Editor before deploying the matching application code.
create table if not exists public.cost_control_settings (
  id boolean primary key default true check (id),
  active boolean not null default true,
  daily_limit_fen integer not null default 3000 check (daily_limit_fen >= 0),
  monthly_limit_fen integer not null default 30000 check (monthly_limit_fen >= 0),
  action_costs jsonb not null default '{"copy_generation":1,"prompt_enhance":1,"image_generation":20,"image_edit":30,"gif_generation":80,"video_generation":300}'::jsonb,
  disabled_actions jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.cost_control_settings(id) values(true) on conflict(id) do nothing;

alter table public.usage_records add column if not exists estimated_cost_fen integer not null default 0 check (estimated_cost_fen >= 0);
create index if not exists usage_records_cost_created_idx on public.usage_records(created_at, status);
alter table public.cost_control_settings enable row level security;

create or replace function public.reserve_generation_budgeted(
  p_user_id uuid, p_credits integer, p_count integer, p_prompt text, p_action text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_settings public.cost_control_settings%rowtype; v_cost integer;
  v_daily integer; v_monthly integer; v_day_start timestamptz; v_month_start timestamptz;
begin
  select * into v_settings from public.cost_control_settings where id=true for update;
  if not found then raise exception 'COST_CONTROL_NOT_CONFIGURED'; end if;
  if not v_settings.active then raise exception 'GENERATION_PAUSED'; end if;
  if v_settings.disabled_actions ? p_action then raise exception 'ACTION_DISABLED'; end if;
  v_cost := greatest(0, coalesce((v_settings.action_costs ->> p_action)::integer, 0));
  v_day_start := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  v_month_start := date_trunc('month', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  select coalesce(sum(estimated_cost_fen),0) into v_daily from public.usage_records where status in ('pending','completed') and created_at >= v_day_start;
  select coalesce(sum(estimated_cost_fen),0) into v_monthly from public.usage_records where status in ('pending','completed') and created_at >= v_month_start;
  if v_settings.daily_limit_fen > 0 and v_daily + v_cost > v_settings.daily_limit_fen then raise exception 'DAILY_BUDGET_REACHED'; end if;
  if v_settings.monthly_limit_fen > 0 and v_monthly + v_cost > v_settings.monthly_limit_fen then raise exception 'MONTHLY_BUDGET_REACHED'; end if;
  update public.profiles set credits=credits-p_credits where id=p_user_id and credits>=p_credits;
  if not found then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into public.usage_records(user_id,image_count,credits,prompt,action,estimated_cost_fen)
  values(p_user_id,p_count,p_credits,left(p_prompt,1000),left(p_action,50),v_cost) returning id into v_id;
  return v_id;
end $$;

