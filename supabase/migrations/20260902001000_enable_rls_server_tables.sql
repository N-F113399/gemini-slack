-- Enable Row Level Security for all server-side application tables.
-- The backend connects with the Supabase service-role key, so these tables
-- remain inaccessible to the anon/authenticated roles unless explicit
-- policies are added later.

alter table public.slack_messages enable row level security;
alter table public.conversation_summaries enable row level security;

-- usage_events is already protected by RLS in its creation migration.
-- Backend writes use the service-role key and therefore bypass RLS.
