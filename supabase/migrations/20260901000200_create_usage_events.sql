create table public.usage_events (
  id bigserial not null,
  occurred_at timestamp with time zone not null default now(),
  provider text not null,
  service text not null,
  operation text not null default 'request',
  success boolean not null default true,
  latency_ms numeric,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint,
  credits numeric,
  request_count numeric,
  estimated_cost_usd numeric,
  error_code text,
  http_status integer,
  retryable boolean,
  quota_related boolean,
  metadata jsonb not null default '{}'::jsonb,

  constraint usage_events_pkey primary key (id)
);

create index if not exists idx_usage_events_occurred_at
  on public.usage_events using btree (occurred_at desc);

create index if not exists idx_usage_events_provider_service
  on public.usage_events using btree (provider, service, occurred_at desc);

create index if not exists idx_usage_events_success
  on public.usage_events using btree (success, occurred_at desc);
