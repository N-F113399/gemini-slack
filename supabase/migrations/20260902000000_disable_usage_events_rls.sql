-- Keep usage_events consistent with the application's other server-side tables.
-- The application accesses Supabase directly from the server, so no RLS policy
-- is required for this table in the current architecture.
alter table public.usage_events disable row level security;
