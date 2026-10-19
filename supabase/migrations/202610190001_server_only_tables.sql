-- Run in Supabase SQL Editor for existing installations. No rows are deleted.
-- This app authorizes requests in Nitro and uses a server-only service key.
begin;
alter table public.auth_users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.guide_articles enable row level security;

revoke all privileges on table public.auth_users, public.auth_sessions,
  public.guide_articles from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_users,
  public.auth_sessions, public.guide_articles to service_role;
commit;
