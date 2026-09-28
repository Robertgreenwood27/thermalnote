-- Thermalnote profiles: a second person gets a notebook and training log of their own.
-- Run once, after the other SQL files. Nothing is deleted or rewritten: every existing note, day,
-- and session gains owner = 'primary' (the APP_USERNAME account) through the column default.

-- A snapshot first, so the notebook as it stood before this migration can always be restored.
create table if not exists public.thermalnote_notes_before_profiles as table public.thermalnote_notes;
create table if not exists public.thermalnote_days_before_profiles as table public.thermalnote_days;
alter table public.thermalnote_notes_before_profiles enable row level security;
alter table public.thermalnote_days_before_profiles enable row level security;
revoke all on public.thermalnote_notes_before_profiles from public, anon, authenticated;
revoke all on public.thermalnote_days_before_profiles from public, anon, authenticated;

alter table public.thermalnote_notes add column if not exists owner text not null default 'primary';
create index if not exists thermalnote_notes_owner_updated on public.thermalnote_notes(owner, updated_at desc) where deleted_at is null;

alter table public.thermalnote_sessions add column if not exists owner text not null default 'primary';

-- Two people can each log the same date, so a day is keyed by who and when.
alter table public.thermalnote_days add column if not exists owner text not null default 'primary';
do $$
begin
  if (select array_agg(a.attname::text order by a.attname) from pg_index i
      join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
      where i.indrelid='public.thermalnote_days'::regclass and i.indisprimary) = array['date'] then
    alter table public.thermalnote_days drop constraint thermalnote_days_pkey;
    alter table public.thermalnote_days add primary key (owner, date);
  end if;
end $$;

-- The original day save stays callable by a server still running the previous release,
-- but it can now only ever touch the primary account's days.
create or replace function public.thermalnote_day_save(day_date text, day_data jsonb, expected_version integer)
returns public.thermalnote_days language plpgsql security invoker set search_path = '' as $$
declare saved public.thermalnote_days;
begin
  if expected_version = 0 then
    begin
      insert into public.thermalnote_days(owner,date,data) values('primary',day_date,day_data) returning * into saved;
    exception when unique_violation then
      raise exception 'Day version conflict' using errcode = 'TN409';
    end;
  else
    update public.thermalnote_days set data=day_data,updated_at=now(),version=version+1
      where owner='primary' and date=day_date and version=expected_version returning * into saved;
    if not found then raise exception 'Day version conflict' using errcode = 'TN409'; end if;
  end if;
  return saved;
end;
$$;

create or replace function public.thermalnote_owner_save(note_owner text, note_id uuid, note_title text, note_content text, note_marks text, expected_version integer)
returns public.thermalnote_notes language plpgsql security invoker set search_path = '' as $$
declare saved public.thermalnote_notes;
begin
  if expected_version = 0 then
    begin
      insert into public.thermalnote_notes(owner,id,title,content,marks) values(note_owner,note_id,note_title,note_content,coalesce(note_marks,'[]')) returning * into saved;
    exception when unique_violation then
      raise exception 'Note version conflict' using errcode = 'TN409';
    end;
  else
    update public.thermalnote_notes set title=note_title,content=note_content,marks=coalesce(note_marks,'[]'),updated_at=now(),version=version+1
      where owner=note_owner and id=note_id and version=expected_version and deleted_at is null returning * into saved;
    if not found then raise exception 'Note version conflict' using errcode = 'TN409'; end if;
  end if;
  return saved;
end;
$$;
revoke all on function public.thermalnote_owner_save(text,uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.thermalnote_owner_save(text,uuid,text,text,text,integer) to service_role;

create or replace function public.thermalnote_owner_delete(note_owner text, note_id uuid, expected_version integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.thermalnote_notes set deleted_at=now(), version=version+1
    where owner=note_owner and id=note_id and version=expected_version and deleted_at is null;
  if not found then raise exception 'Note version conflict' using errcode = 'TN409'; end if;
end;
$$;
revoke all on function public.thermalnote_owner_delete(text,uuid,integer) from public, anon, authenticated;
grant execute on function public.thermalnote_owner_delete(text,uuid,integer) to service_role;

create or replace function public.thermalnote_owner_day_save(day_owner text, day_date text, day_data jsonb, expected_version integer)
returns public.thermalnote_days language plpgsql security invoker set search_path = '' as $$
declare saved public.thermalnote_days;
begin
  if expected_version = 0 then
    begin
      insert into public.thermalnote_days(owner,date,data) values(day_owner,day_date,day_data) returning * into saved;
    exception when unique_violation then
      raise exception 'Day version conflict' using errcode = 'TN409';
    end;
  else
    update public.thermalnote_days set data=day_data,updated_at=now(),version=version+1
      where owner=day_owner and date=day_date and version=expected_version returning * into saved;
    if not found then raise exception 'Day version conflict' using errcode = 'TN409'; end if;
  end if;
  return saved;
end;
$$;
revoke all on function public.thermalnote_owner_day_save(text,text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.thermalnote_owner_day_save(text,text,jsonb,integer) to service_role;
