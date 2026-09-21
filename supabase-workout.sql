-- Workout mode: one versioned document per day, private to the server role.
-- Existing notes, images, and sessions are unchanged.
create table if not exists public.thermalnote_days (
  date text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
alter table public.thermalnote_days enable row level security;
revoke all on public.thermalnote_days from public, anon, authenticated;
grant select, insert, update, delete on public.thermalnote_days to service_role;

create or replace function public.thermalnote_day_save(day_date text, day_data jsonb, expected_version integer)
returns public.thermalnote_days language plpgsql security invoker set search_path = '' as $$
declare saved public.thermalnote_days;
begin
  if expected_version = 0 then
    begin
      insert into public.thermalnote_days(date,data) values(day_date,day_data) returning * into saved;
    exception when unique_violation then
      raise exception 'Day version conflict' using errcode = 'TN409';
    end;
  else
    update public.thermalnote_days set data=day_data,updated_at=now(),version=version+1
      where date=day_date and version=expected_version returning * into saved;
    if not found then raise exception 'Day version conflict' using errcode = 'TN409'; end if;
  end if;
  return saved;
end;
$$;
revoke all on function public.thermalnote_day_save(text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.thermalnote_day_save(text,jsonb,integer) to service_role;
