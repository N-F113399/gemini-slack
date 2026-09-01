-- Initial database schema for gemini-slack
--
-- This migration reflects the existing Supabase database schema at the time
-- database migrations were introduced. It is intentionally schema-only;
-- existing production data is not included.

create table public.slack_messages (
  id bigserial not null,
  channel_id text not null,
  thread_ts text not null,
  message_ts text not null,
  user_id text null,
  role text not null,
  text_cipher text not null,
  iv text not null,
  auth_tag text not null,
  enc_version integer not null default 1,
  created_at timestamp with time zone not null default now(),
  constraint slack_messages_pkey primary key (id)
) TABLESPACE pg_default;

create index if not exists idx_slack_thread_created_at
  on public.slack_messages using btree (channel_id, thread_ts, created_at desc)
  TABLESPACE pg_default;

create unique index if not exists uq_message_ts
  on public.slack_messages using btree (message_ts)
  TABLESPACE pg_default;
