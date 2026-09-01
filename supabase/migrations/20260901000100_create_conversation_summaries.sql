create table public.conversation_summaries (
  id bigserial not null,
  channel_id text not null,
  thread_ts text not null,
  summary_cipher text not null,
  iv text not null,
  auth_tag text not null,
  enc_version integer not null default 1,
  message_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  constraint conversation_summaries_pkey primary key (id),
  constraint uq_conversation_summary_thread unique (channel_id, thread_ts)
);

create index if not exists idx_conversation_summaries_thread
  on public.conversation_summaries using btree (channel_id, thread_ts);
