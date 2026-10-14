-- Part 1 · 0002 — Owner table, owner check, updated_at trigger, validation helpers (spec 01 §3.3, §3.5)

-- ---------------------------------------------------------------------------
-- Owner (exactly one row, set once during setup step S6)
-- ---------------------------------------------------------------------------
create table if not exists public.app_owner (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  singleton boolean not null default true unique check (singleton)
);

comment on table public.app_owner is
  'The single admin account. Insert once: insert into app_owner (user_id) select id from auth.users where email = ''<you>'';';

-- True when the current request is made by the owner. Used by every RLS policy.
-- security definer: reads app_owner, which no API role can read directly.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_owner where user_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Validation helpers (immutable, used in CHECK constraints)
-- ---------------------------------------------------------------------------

-- https:// URL, no whitespace, max 2000 chars
create or replace function public.is_https_url(v text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v ~ '^https://[^\s/?#]+[^\s]*$' and char_length(v) <= 2000;
$$;

-- Path inside a storage bucket, e.g. 'images/projects/2b1f.webp' (no scheme, no '..', no leading slash)
create or replace function public.is_storage_path(v text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v ~ '^[A-Za-z0-9][A-Za-z0-9/_.-]*$' and v !~ '\.\.' and v !~ '//' and char_length(v) <= 500;
$$;

-- lowercase-words-with-hyphens
create or replace function public.is_slug(v text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(v) <= 80;
$$;

create or replace function public.is_email(v text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(v) between 3 and 254;
$$;

-- Every element is non-blank and at most max_len chars; at most max_items elements.
create or replace function public.is_text_list(arr text[], max_items int, max_len int)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(arr), 0) <= max_items
     and not exists (
       select 1 from unnest(arr) as x
       where x is null or char_length(btrim(x)) = 0 or char_length(x) > max_len
     );
$$;

-- Image reference: { path, alt, width?, height?, blurhash? }  (spec 01 §3.1, master spec A-5)
create or replace function public.is_image_ref(j jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
begin
  if j is null then
    return true;
  end if;
  if jsonb_typeof(j) <> 'object' then
    return false;
  end if;
  -- only known keys
  for k in select jsonb_object_keys(j) loop
    if k not in ('path', 'alt', 'width', 'height', 'blurhash') then
      return false;
    end if;
  end loop;
  -- path: storage path or https URL
  if jsonb_typeof(j -> 'path') is distinct from 'string' then
    return false;
  end if;
  if not (public.is_storage_path(j ->> 'path') or public.is_https_url(j ->> 'path')) then
    return false;
  end if;
  -- alt: required, 1–200 chars
  if jsonb_typeof(j -> 'alt') is distinct from 'string'
     or char_length(btrim(j ->> 'alt')) not between 1 and 200 then
    return false;
  end if;
  -- width / height: optional positive numbers
  foreach k in array array['width', 'height'] loop
    if j ? k and jsonb_typeof(j -> k) <> 'null' then
      if jsonb_typeof(j -> k) <> 'number' then
        return false;
      end if;
      if (j ->> k)::numeric <= 0 or (j ->> k)::numeric > 20000 then
        return false;
      end if;
    end if;
  end loop;
  if j ? 'blurhash' and jsonb_typeof(j -> 'blurhash') <> 'null'
     and (jsonb_typeof(j -> 'blurhash') <> 'string' or char_length(j ->> 'blurhash') > 100) then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.is_image_ref_array(j jsonb, max_items int)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  el jsonb;
begin
  if j is null then
    return true;
  end if;
  if jsonb_typeof(j) <> 'array' or jsonb_array_length(j) > max_items then
    return false;
  end if;
  for el in select value from jsonb_array_elements(j) loop
    if el is null or jsonb_typeof(el) <> 'object' or not public.is_image_ref(el) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Object whose keys are all in `allowed` and whose values are null or https URLs.
create or replace function public.is_url_map(j jsonb, allowed text[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  r record;
begin
  if j is null then
    return true;
  end if;
  if jsonb_typeof(j) <> 'object' then
    return false;
  end if;
  for r in select key, value from jsonb_each(j) loop
    if not (r.key = any (allowed)) then
      return false;
    end if;
    if jsonb_typeof(r.value) = 'null' then
      continue;
    end if;
    if jsonb_typeof(r.value) <> 'string' or not public.is_https_url(r.value #>> '{}') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- { lat: -90..90, lng: -180..180 }
create or replace function public.is_globe_position(j jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if j is null then
    return true;
  end if;
  if jsonb_typeof(j) <> 'object'
     or (select count(*) from jsonb_object_keys(j)) <> 2
     or jsonb_typeof(j -> 'lat') is distinct from 'number'
     or jsonb_typeof(j -> 'lng') is distinct from 'number' then
    return false;
  end if;
  return (j ->> 'lat')::numeric between -90 and 90
     and (j ->> 'lng')::numeric between -180 and 180;
end;
$$;

-- SEO block: { title? ≤70, description? ≤160, og_image? ImageRef }
create or replace function public.is_seo(j jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
begin
  if j is null then
    return true;
  end if;
  if jsonb_typeof(j) <> 'object' then
    return false;
  end if;
  for k in select jsonb_object_keys(j) loop
    if k not in ('title', 'description', 'og_image') then
      return false;
    end if;
  end loop;
  if j ? 'title' and jsonb_typeof(j -> 'title') <> 'null'
     and (jsonb_typeof(j -> 'title') <> 'string' or char_length(j ->> 'title') > 70) then
    return false;
  end if;
  if j ? 'description' and jsonb_typeof(j -> 'description') <> 'null'
     and (jsonb_typeof(j -> 'description') <> 'string' or char_length(j ->> 'description') > 160) then
    return false;
  end if;
  if j ? 'og_image' and jsonb_typeof(j -> 'og_image') <> 'null'
     and not public.is_image_ref(j -> 'og_image') then
    return false;
  end if;
  return true;
end;
$$;

-- Custom section field definitions (spec 01 §3.3 custom_sections)
-- [{ key, label, type, required, options?, help? }], 1–15 fields
create or replace function public.is_valid_field_defs(j jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  f jsonb;
  k text;
  opt jsonb;
  seen text[] := '{}';
  opts text[];
begin
  if j is null or jsonb_typeof(j) <> 'array' or jsonb_array_length(j) not between 1 and 15 then
    return false;
  end if;
  for f in select value from jsonb_array_elements(j) loop
    if jsonb_typeof(f) <> 'object' then
      return false;
    end if;
    for k in select jsonb_object_keys(f) loop
      if k not in ('key', 'label', 'type', 'required', 'options', 'help') then
        return false;
      end if;
    end loop;
    -- key: ^[a-z][a-z0-9_]{0,29}$, unique within the section
    if jsonb_typeof(f -> 'key') is distinct from 'string'
       or (f ->> 'key') !~ '^[a-z][a-z0-9_]{0,29}$'
       or (f ->> 'key') = any (seen) then
      return false;
    end if;
    seen := seen || (f ->> 'key');
    -- label: 1–40
    if jsonb_typeof(f -> 'label') is distinct from 'string'
       or char_length(btrim(f ->> 'label')) not between 1 and 40 then
      return false;
    end if;
    -- type
    if jsonb_typeof(f -> 'type') is distinct from 'string'
       or (f ->> 'type') not in ('text', 'long_text', 'markdown', 'number', 'date', 'url', 'image', 'tags', 'boolean', 'select') then
      return false;
    end if;
    -- required: boolean
    if jsonb_typeof(f -> 'required') is distinct from 'boolean' then
      return false;
    end if;
    -- options: 1–50 unique non-blank strings (≤60) for select; absent/null otherwise
    if (f ->> 'type') = 'select' then
      if jsonb_typeof(f -> 'options') is distinct from 'array'
         or jsonb_array_length(f -> 'options') not between 1 and 50 then
        return false;
      end if;
      opts := '{}';
      for opt in select value from jsonb_array_elements(f -> 'options') loop
        if jsonb_typeof(opt) <> 'string'
           or char_length(btrim(opt #>> '{}')) not between 1 and 60
           or (opt #>> '{}') = any (opts) then
          return false;
        end if;
        opts := opts || (opt #>> '{}');
      end loop;
    elsif f ? 'options' and jsonb_typeof(f -> 'options') <> 'null' then
      return false;
    end if;
    -- help: optional, ≤120
    if f ? 'help' and jsonb_typeof(f -> 'help') <> 'null'
       and (jsonb_typeof(f -> 'help') <> 'string' or char_length(f ->> 'help') > 120) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;
