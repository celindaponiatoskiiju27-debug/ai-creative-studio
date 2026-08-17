-- Run this file once in Supabase SQL Editor.
create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed')),
  unread_user integer not null default 0 check (unread_user >= 0),
  unread_admin integer not null default 0 check (unread_admin >= 0),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('user','admin')),
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists support_conversations_last_idx on public.support_conversations(status,last_message_at desc);
create index if not exists support_messages_conversation_idx on public.support_messages(conversation_id,created_at);
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
drop policy if exists "users can read own support conversation" on public.support_conversations;
create policy "users can read own support conversation" on public.support_conversations for select using (auth.uid() = user_id);
drop policy if exists "users can read own support messages" on public.support_messages;
create policy "users can read own support messages" on public.support_messages for select using (
  exists (select 1 from public.support_conversations c where c.id=conversation_id and c.user_id=auth.uid())
);
