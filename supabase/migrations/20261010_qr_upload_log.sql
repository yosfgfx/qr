-- QR Files viewer: upload event log + admin-only read API.
-- Applied to project qwjliaaonpthvufqaqyc on 2026-10-09 (migration "qr_upload_log_and_admin_viewer").
-- Safe to re-run.

-- One row per upload (including re-uploads of a file that already exists).
create table if not exists public.qr_uploads (
  id uuid primary key default gen_random_uuid(),
  object_path text not null check (object_path ~ '^f/[0-9a-f]{24,64}(\.[a-z0-9]{1,12})?$'),
  original_name text check (char_length(original_name) <= 255),
  size bigint check (size >= 0),
  mime text check (char_length(mime) <= 120),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  reused boolean not null default false,
  page text check (char_length(page) <= 300),
  client jsonb not null default '{}'::jsonb check (pg_column_size(client) <= 4096),
  -- filled server-side by trigger from the request headers (client values are overwritten)
  user_agent text,
  ip text,
  country text,
  origin text,
  created_at timestamptz not null default now()
);
create index if not exists qr_uploads_object_path_idx on public.qr_uploads (object_path, created_at);

create or replace function public.qr_uploads_fill_server_fields()
returns trigger language plpgsql set search_path = '' as $$
declare h jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
begin
  new.id := gen_random_uuid();
  new.created_at := now();
  new.user_agent := left(h->>'user-agent', 512);
  new.ip := left(coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1), h->>'x-real-ip'), 64);
  new.country := left(h->>'cf-ipcountry', 8);
  new.origin := left(coalesce(h->>'origin', h->>'referer'), 300);
  return new;
end $$;

drop trigger if exists qr_uploads_fill on public.qr_uploads;
create trigger qr_uploads_fill before insert on public.qr_uploads
for each row execute function public.qr_uploads_fill_server_fields();

alter table public.qr_uploads enable row level security;
revoke all on public.qr_uploads from anon, authenticated;
grant insert on public.qr_uploads to anon, authenticated;
drop policy if exists "qr_uploads: anonymous insert" on public.qr_uploads;
create policy "qr_uploads: anonymous insert" on public.qr_uploads
  for insert to anon, authenticated with check (true);

-- Viewer admins (no policies: not readable through the API).
create table if not exists public.qr_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.qr_admins enable row level security;
revoke all on public.qr_admins from anon, authenticated;
insert into public.qr_admins (user_id)
  select id from auth.users where email = 'yosfgfx@gmail.com'
  on conflict do nothing;

create or replace function public.qr_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.qr_admins where user_id = (select auth.uid()));
$$;

-- Every object in qr-files with its storage metadata and all logged upload events.
create or replace function public.qr_admin_files()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.qr_is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(f order by f.created_at desc) from (
      select o.id, o.name, o.created_at, o.updated_at, o.last_accessed_at,
             o.metadata, o.user_metadata, o.version,
             coalesce((select jsonb_agg(to_jsonb(u) - 'object_path' order by u.created_at)
                       from public.qr_uploads u where u.object_path = o.name), '[]'::jsonb) as uploads
      from storage.objects o
      where o.bucket_id = 'qr-files'
    ) f
  ), '[]'::jsonb);
end $$;

revoke all on function public.qr_is_admin() from public, anon;
revoke all on function public.qr_admin_files() from public, anon;
grant execute on function public.qr_is_admin() to authenticated;
grant execute on function public.qr_admin_files() to authenticated;
revoke all on function public.qr_uploads_fill_server_fields() from public, anon, authenticated;

-- To add another admin:
--   insert into public.qr_admins (user_id) select id from auth.users where email = 'someone@example.com';
