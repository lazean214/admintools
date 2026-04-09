-- WebTools Supabase schema
-- Run in Supabase SQL Editor before starting the app.

create table if not exists public.auth_users (
  id text primary key,
  name text not null,
  email text not null unique,
  role text not null default 'viewer' check (role in ('admin', 'editor', 'viewer')),
  password_hash text not null,
  password_salt text not null,
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_sessions (
  token text primary key,
  user_id text not null references public.auth_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_sessions_user_id on public.auth_sessions(user_id);
create index if not exists idx_auth_sessions_expires_at on public.auth_sessions(expires_at);

create table if not exists public.guide_articles (
  id text primary key,
  title text not null,
  slug text not null unique,
  excerpt text not null default '',
  cover_image text not null default '',
  hashtags_json text not null default '[]',
  markdown text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_guide_articles_updated_at on public.guide_articles(updated_at desc);

-- Optional helper trigger to keep updated_at current if you perform direct SQL updates.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_auth_users_updated_at on public.auth_users;
create trigger trg_auth_users_updated_at
before update on public.auth_users
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_guide_articles_updated_at on public.guide_articles;
create trigger trg_guide_articles_updated_at
before update on public.guide_articles
for each row execute procedure public.set_updated_at();
