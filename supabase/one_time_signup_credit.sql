create table if not exists public.signup_credit_grants (
  email text primary key,
  granted_at timestamptz not null default now()
);

alter table public.signup_credit_grants enable row level security;

insert into public.signup_credit_grants (email, granted_at)
select lower(email), created_at from public.profiles where email is not null
on conflict (email) do nothing;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_granted integer := 0;
begin
  insert into public.signup_credit_grants (email)
  values (lower(new.email))
  on conflict (email) do nothing;

  if found then v_granted := 10; end if;

  insert into public.profiles (id, email, credits)
  values (new.id, new.email, v_granted);
  return new;
end;
$$;
