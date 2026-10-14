-- Part 1 · 0007 — reorder() (spec 01 §3.5, DM-8)
--
-- Sets sort_order of the given rows to their position in p_ids (0-based).
-- Called from the admin after drag-to-reorder:
--   supabase.rpc('reorder', { p_table: 'projects', p_ids: [id3, id1, id2] })

create or replace function public.reorder(p_table text, p_ids uuid[])
returns void
language plpgsql
security invoker -- runs with the caller's rights, so RLS still applies
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  -- fixed whitelist: the table name is never taken from user input beyond these values
  if p_table not in (
    'hero_media', 'projects', 'achievements', 'experience',
    'skills', 'testimonials', 'custom_sections', 'custom_items'
  ) then
    raise exception 'Cannot reorder table "%"', p_table using errcode = '22023';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  if cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) as x) then
    raise exception 'Duplicate ids in reorder list' using errcode = '22023';
  end if;

  execute format(
    'update public.%I as t set sort_order = (x.ord - 1)::int
       from unnest($1) with ordinality as x(id, ord)
      where t.id = x.id',
    p_table
  ) using p_ids;
end;
$$;

revoke execute on function public.reorder(text, uuid[]) from public, anon;
grant execute on function public.reorder(text, uuid[]) to authenticated;
