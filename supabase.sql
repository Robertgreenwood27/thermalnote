-- Thermalnote: private server-only access. No anonymous or browser table access.
create table if not exists public.thermalnote_notes (
  id uuid primary key,
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  marks text not null default '[]'
);
alter table public.thermalnote_notes enable row level security;
revoke all on public.thermalnote_notes from anon, authenticated;
grant select, insert, update, delete on public.thermalnote_notes to service_role;
create index if not exists thermalnote_notes_updated on public.thermalnote_notes(updated_at desc) where deleted_at is null;

create or replace function public.thermalnote_save(note_id uuid, note_title text, note_content text, note_marks text, expected_version integer)
returns public.thermalnote_notes language plpgsql security invoker set search_path = '' as $$
declare saved public.thermalnote_notes;
begin
  if expected_version = 0 then
    begin
      insert into public.thermalnote_notes(id,title,content,marks) values(note_id,note_title,note_content,coalesce(note_marks,'[]')) returning * into saved;
    exception when unique_violation then
      raise exception 'Note version conflict' using errcode = 'TN409';
    end;
  else
    update public.thermalnote_notes set title=note_title,content=note_content,marks=coalesce(note_marks,'[]'),updated_at=now(),version=version+1
      where id=note_id and version=expected_version and deleted_at is null returning * into saved;
    if not found then raise exception 'Note version conflict' using errcode = 'TN409'; end if;
  end if;
  return saved;
end;
$$;
revoke all on function public.thermalnote_save(uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.thermalnote_save(uuid,text,text,text,integer) to service_role;

create or replace function public.thermalnote_delete(note_id uuid, expected_version integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.thermalnote_notes set deleted_at=now(), version=version+1 where id=note_id and version=expected_version and deleted_at is null;
  if not found then raise exception 'Note version conflict' using errcode = 'TN409'; end if;
end;
$$;
revoke all on function public.thermalnote_delete(uuid,integer) from public, anon, authenticated;
grant execute on function public.thermalnote_delete(uuid,integer) to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('thermalnote-images','thermalnote-images',false,12582912,ARRAY['image/png','image/jpeg','image/webp','image/gif','image/avif'])
on conflict (id) do nothing;
