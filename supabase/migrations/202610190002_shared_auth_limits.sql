-- Shared admission control for all production instances. Run before deployment.
begin;
create table if not exists public.auth_rate_limits (
  key text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
create index if not exists idx_auth_rate_limits_expires on public.auth_rate_limits(expires_at);
alter table public.auth_rate_limits enable row level security;
revoke all privileges on table public.auth_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_rate_limits to service_role;

create or replace function public.consume_auth_rate_limit(p_key text)
returns table(allowed boolean,retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_limit integer;
  v_seconds integer;
  v_attempts integer;
  v_expires timestamptz;
begin
  if p_key is null or p_key !~ '^(login|register):[0-9a-f]{64}$' then
    raise exception 'Invalid rate limit key';
  end if;
  if pg_catalog.split_part(p_key,':',1) = 'login' then
    v_limit := 30; v_seconds := 900;
  else
    v_limit := 10; v_seconds := 3600;
  end if;
  delete from public.auth_rate_limits where key in (
    select key from public.auth_rate_limits where expires_at <= v_now
    order by expires_at, key limit 256
  );
  insert into public.auth_rate_limits as bucket(key,attempts,expires_at)
  values(p_key,1,v_now + pg_catalog.make_interval(secs => v_seconds))
  on conflict(key) do update set
    attempts = case when bucket.expires_at <= v_now then 1 else least(bucket.attempts+1,v_limit+1) end,
    expires_at = case when bucket.expires_at <= v_now then v_now + pg_catalog.make_interval(secs => v_seconds) else bucket.expires_at end
  returning attempts,expires_at into v_attempts,v_expires;
  return query select v_attempts <= v_limit,
    greatest(1,ceil(extract(epoch from (v_expires-v_now)))::integer);
end;
$$;
revoke all privileges on function public.consume_auth_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text) to service_role;
commit;
