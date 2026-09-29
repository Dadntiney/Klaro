-- Klaro foundation: profiles, captures, items, and row level security.
-- Run in the Supabase SQL editor, or with the Supabase CLI (`supabase db push`).
-- The app uses the anon key plus the signed-in user. It does not use the service role.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) <= 80
  )
);

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  raw_text text not null,
  summary text,
  interpreter text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint captures_raw_text_length check (char_length(raw_text) between 1 and 4000),
  constraint captures_summary_length check (summary is null or char_length(summary) <= 400),
  constraint captures_interpreter check (interpreter is null or interpreter in ('openai', 'local')),
  constraint captures_status check (status in ('pending', 'confirmed', 'dismissed'))
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  capture_id uuid references public.captures (id) on delete set null,
  kind text not null,
  title text not null,
  notes text,
  due_at timestamptz,
  remind_at timestamptz,
  status text not null default 'proposed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_kind check (kind in ('taak', 'herinnering')),
  constraint items_title_length check (char_length(title) between 1 and 280),
  constraint items_notes_length check (notes is null or char_length(notes) <= 2000),
  constraint items_status check (status in ('proposed', 'open', 'done', 'dismissed'))
);

create index captures_user_created_idx on public.captures (user_id, created_at desc);
create index items_user_status_idx on public.items (user_id, status, created_at desc);
create index items_capture_idx on public.items (capture_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data->>'display_name', ''), 80), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.captures enable row level security;
alter table public.items enable row level security;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy captures_select_own
  on public.captures
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy captures_insert_own
  on public.captures
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy captures_update_own
  on public.captures
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy captures_delete_own
  on public.captures
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create policy items_select_own
  on public.items
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy items_insert_own
  on public.items
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      capture_id is null
      or exists (
        select 1
        from public.captures
        where captures.id = items.capture_id
          and captures.user_id = (select auth.uid())
      )
    )
  );

create policy items_update_own
  on public.items
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      capture_id is null
      or exists (
        select 1
        from public.captures
        where captures.id = items.capture_id
          and captures.user_id = (select auth.uid())
      )
    )
  );

create policy items_delete_own
  on public.items
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.profiles from public, anon;
revoke all on table public.captures from public, anon;
revoke all on table public.items from public, anon;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.captures to authenticated;
grant select, insert, update, delete on table public.items to authenticated;

create or replace function public.confirm_capture(p_capture_id uuid, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  seen uuid[] := '{}';
  item_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.captures
    where id = p_capture_id
      and user_id = (select auth.uid())
      and status = 'pending'
  ) then
    raise exception 'capture not pending';
  end if;

  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 12 then
    raise exception 'invalid items';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if coalesce(item->>'kind', '') not in ('taak', 'herinnering') then
      raise exception 'invalid kind';
    end if;
    if char_length(coalesce(item->>'title', '')) < 1
      or char_length(item->>'title') > 280 then
      raise exception 'invalid title';
    end if;
    if item->>'notes' is not null and char_length(item->>'notes') > 2000 then
      raise exception 'invalid notes';
    end if;

    item_id := null;
    if coalesce(item->>'id', '') <> '' then
      item_id := (item->>'id')::uuid;
    end if;

    if item_id is not null and exists (
      select 1
      from public.items
      where id = item_id
        and capture_id = p_capture_id
        and user_id = (select auth.uid())
    ) then
      update public.items
      set
        kind = item->>'kind',
        title = item->>'title',
        notes = nullif(item->>'notes', ''),
        due_at = nullif(item->>'due_at', '')::timestamptz,
        remind_at = nullif(item->>'remind_at', '')::timestamptz,
        status = 'open',
        updated_at = now()
      where id = item_id
        and user_id = (select auth.uid());
      seen := array_append(seen, item_id);
    else
      insert into public.items (
        user_id,
        capture_id,
        kind,
        title,
        notes,
        due_at,
        remind_at,
        status
      )
      values (
        (select auth.uid()),
        p_capture_id,
        item->>'kind',
        item->>'title',
        nullif(item->>'notes', ''),
        nullif(item->>'due_at', '')::timestamptz,
        nullif(item->>'remind_at', '')::timestamptz,
        'open'
      );
    end if;
  end loop;

  update public.items
  set status = 'dismissed', updated_at = now()
  where capture_id = p_capture_id
    and user_id = (select auth.uid())
    and status = 'proposed'
    and id <> all(seen);

  update public.captures
  set status = 'confirmed'
  where id = p_capture_id
    and user_id = (select auth.uid());
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.confirm_capture(uuid, jsonb) from public, anon;
grant execute on function public.confirm_capture(uuid, jsonb) to authenticated;
