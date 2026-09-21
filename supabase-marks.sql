-- Thermalnote study marks. Run once on a notebook installed before marks existed.
-- Notes keep every word they already hold; confidence is added beside the text, never inside it.
alter table public.thermalnote_notes add column if not exists marks text not null default '[]';

-- The old four-argument save is replaced outright so no ambiguous overload remains.
drop function if exists public.thermalnote_save(uuid,text,text,integer);

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
