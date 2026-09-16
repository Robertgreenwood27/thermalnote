-- Deployment migration: durable sessions and a shared login attempt limit.
-- Existing notes and images are unchanged.
create table if not exists public.thermalnote_sessions (
  token_hash text primary key,
  expires_at timestamptz not null
);
alter table public.thermalnote_sessions enable row level security;
revoke all on public.thermalnote_sessions from public, anon, authenticated;
grant select, insert, delete on public.thermalnote_sessions to service_role;
create index if not exists thermalnote_sessions_expiry on public.thermalnote_sessions(expires_at);

create table if not exists public.thermalnote_login_attempts (
  id text primary key,
  count integer not null,
  expires_at timestamptz not null
);
alter table public.thermalnote_login_attempts enable row level security;
revoke all on public.thermalnote_login_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.thermalnote_login_attempts to service_role;

create or replace function public.thermalnote_login_attempt()
returns integer language plpgsql security invoker set search_path = '' as $$
declare attempts integer;
begin
  delete from public.thermalnote_sessions where expires_at <= now();
  insert into public.thermalnote_login_attempts as existing (id,count,expires_at)
  values ('login',1,now()+interval '15 minutes')
  on conflict (id) do update set
    count=case when existing.expires_at<=now() then 1 else existing.count+1 end,
    expires_at=case when existing.expires_at<=now() then excluded.expires_at else existing.expires_at end
  returning count into attempts;
  return attempts;
end;
$$;
revoke all on function public.thermalnote_login_attempt() from public, anon, authenticated;
grant execute on function public.thermalnote_login_attempt() to service_role;
