-- Keep usage_events protected by row-level security.
-- Server-side access uses the Supabase service-role key, which bypasses RLS.
alter table public.usage_events enable row level security;
