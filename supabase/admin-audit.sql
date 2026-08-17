-- Run once in Supabase SQL Editor.
create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_admin_created_idx on public.admin_audit_logs(admin_id,created_at desc);
alter table public.admin_audit_logs enable row level security;
revoke all on table public.admin_audit_logs from anon,authenticated;
grant all on table public.admin_audit_logs to service_role;
grant usage,select on sequence public.admin_audit_logs_id_seq to service_role;
