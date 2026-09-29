-- Life assistant: documents, lists, conversations, reminders and inbox metadata.
-- Extends the existing Klaro project. Does not replace auth or the first migration.

alter table public.profiles
  add column if not exists timezone text not null default 'Europe/Amsterdam',
  add column if not exists onboarded_at timestamptz,
  add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_timezone_length;

alter table public.profiles
  add constraint profiles_timezone_length check (char_length(timezone) between 1 and 80);

alter table public.captures
  add column if not exists input_kind text not null default 'text',
  add column if not exists file_name text,
  add column if not exists file_path text,
  add column if not exists mime_type text,
  add column if not exists category text,
  add column if not exists proposal jsonb,
  add column if not exists archived_at timestamptz;

alter table public.captures drop constraint if exists captures_input_kind;
alter table public.captures
  add constraint captures_input_kind
  check (input_kind in ('text', 'image', 'document', 'audio', 'file'));

alter table public.items drop constraint if exists items_kind;
alter table public.items
  add constraint items_kind
  check (kind in ('taak', 'herinnering', 'afspraak', 'notitie'));

alter table public.items
  add column if not exists priority text not null default 'normaal',
  add column if not exists category text,
  add column if not exists location text,
  add column if not exists recurrence text,
  add column if not exists snoozed_until timestamptz,
  add column if not exists parent_id uuid references public.items (id) on delete cascade;

alter table public.items drop constraint if exists items_priority;
alter table public.items
  add constraint items_priority check (priority in ('laag', 'normaal', 'hoog'));

alter table public.items drop constraint if exists items_recurrence;
alter table public.items
  add constraint items_recurrence check (
    recurrence is null
    or recurrence in ('daily', 'weekly', 'monthly', 'yearly', 'first_monday')
  );

create index if not exists items_user_due_idx on public.items (user_id, due_at);
create index if not exists items_parent_idx on public.items (parent_id);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  capture_id uuid references public.captures (id) on delete set null,
  title text not null,
  category text not null default 'overig',
  summary text,
  supplier text,
  amount_cents integer,
  reference_code text,
  due_on date,
  starts_on date,
  ends_on date,
  file_path text,
  file_name text,
  mime_type text,
  text_content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_title_length check (char_length(title) between 1 and 200),
  constraint documents_category check (
    category in (
      'factuur', 'verzekering', 'contract', 'garantie', 'ticket',
      'identiteit', 'woning', 'auto', 'overig'
    )
  )
);

create index if not exists documents_user_created_idx on public.documents (user_id, created_at desc);

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  constraint lists_title_length check (char_length(title) between 1 and 80)
);

create table if not exists public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  constraint list_items_title_length check (char_length(title) between 1 and 200)
);

create index if not exists lists_user_idx on public.lists (user_id, created_at desc);
create index if not exists list_items_list_idx on public.list_items (list_id, position);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_title_length check (char_length(title) between 1 and 120)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  content text not null,
  context jsonb,
  created_at timestamptz not null default now(),
  constraint messages_role check (role in ('user', 'assistant')),
  constraint messages_content_length check (char_length(content) between 1 and 8000)
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

create table if not exists public.notification_states (
  user_id uuid not null references auth.users (id) on delete cascade,
  source_key text not null,
  status text not null,
  snoozed_until timestamptz,
  primary key (user_id, source_key),
  constraint notification_states_status check (status in ('read', 'dismissed', 'snoozed')),
  constraint notification_states_key_length check (char_length(source_key) between 1 and 160)
);

alter table public.documents enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notification_states enable row level security;

create policy documents_own on public.documents
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy lists_own on public.lists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy list_items_own on public.list_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.lists
      where lists.id = list_items.list_id
        and lists.user_id = (select auth.uid())
    )
  );

create policy conversations_own on public.conversations
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy messages_own on public.messages
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.conversations
      where conversations.id = messages.conversation_id
        and conversations.user_id = (select auth.uid())
    )
  );

create policy notification_states_own on public.notification_states
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.documents from public, anon;
revoke all on table public.lists from public, anon;
revoke all on table public.list_items from public, anon;
revoke all on table public.conversations from public, anon;
revoke all on table public.messages from public, anon;
revoke all on table public.notification_states from public, anon;

grant select, insert, update, delete on table public.documents to authenticated;
grant select, insert, update, delete on table public.lists to authenticated;
grant select, insert, update, delete on table public.list_items to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.messages to authenticated;
grant select, insert, update, delete on table public.notification_states to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('klaro', 'klaro', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

create policy klaro_storage_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'klaro'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy klaro_storage_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'klaro'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy klaro_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'klaro'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from storage.objects
  where bucket_id = 'klaro'
    and name like uid::text || '/%';

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
