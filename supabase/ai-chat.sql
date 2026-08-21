-- 电商 AI 顾问：会话与消息持久化。
create extension if not exists pgcrypto;

create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '新对话',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ai_chat_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  model_id text,
  provider text,
  usage_id uuid references public.usage_records(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_sessions_user_idx on public.ai_chat_sessions(user_id, updated_at desc);
create index if not exists ai_chat_messages_session_idx on public.ai_chat_messages(session_id, created_at);

alter table public.ai_chat_sessions enable row level security;
alter table public.ai_chat_messages enable row level security;

drop policy if exists "users manage own chat sessions" on public.ai_chat_sessions;
create policy "users manage own chat sessions" on public.ai_chat_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own chat messages" on public.ai_chat_messages;
create policy "users manage own chat messages" on public.ai_chat_messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.ai_chat_sessions to authenticated;
grant select, insert, update, delete on public.ai_chat_messages to authenticated;
grant all privileges on public.ai_chat_sessions, public.ai_chat_messages to service_role;

update public.cost_control_settings
set action_costs = case when action_costs ? 'ai_chat' then action_costs else action_costs || '{"ai_chat":1}'::jsonb end,
    updated_at = now()
where id = true;
