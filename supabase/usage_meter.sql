-- Shared FreeSurf usage meter (reader / transcriber / calorie tracker + future apps)
-- Run once on the shared Supabase project. Table is keyed by (user_id, metric, week_start)
-- so weekly free allowances reset cleanly and are easy to query for the usage UI.

create table if not exists public.usage (
  user_id    text not null,
  metric     text not null,          -- e.g. 'reader_chars', 'transcribe_minutes', 'calorie_requests'
  week_start date not null,          -- Monday of the usage week (UTC)
  count      bigint not null default 0,
  primary key (user_id, metric, week_start)
);

alter table public.usage enable row level security;

-- Meter helpers only run server-side (service role); RLS denies public/anonymous writes.
create policy "usage is private"
  on public.usage for all
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

-- Atomically add `delta` to the week's count for a user+metric and return the new count.
-- Called by the Workers with the service role key (so RLS is bypassed). Doing the
-- increment in SQL avoids races between concurrent requests.
create or replace function public.meter_usage(
  p_user_id text,
  p_metric  text,
  p_week    date,
  p_delta   bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare v_count bigint;
begin
  insert into public.usage (user_id, metric, week_start, count)
  values (p_user_id, p_metric, p_week, p_delta)
  on conflict (user_id, metric, week_start)
  do update set count = public.usage.count + p_delta
  returning public.usage.count into v_count;
  return v_count;
end;
$$;
