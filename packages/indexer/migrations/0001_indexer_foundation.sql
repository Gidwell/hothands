-- Hot Hands indexer foundation.
-- Raw tables are append/upsert friendly; derived product projections should be
-- rebuilt from these rows instead of treating UI caches as source of truth.

create table if not exists predict_oracles (
  oracle_id text primary key,
  predict_id text not null,
  oracle_cap_id text,
  underlying_asset text not null,
  expiry_ms bigint not null,
  min_strike numeric not null,
  tick_size numeric not null,
  status text not null,
  activated_at_ms bigint,
  settlement_price numeric,
  settled_at_ms bigint,
  created_checkpoint bigint,
  raw jsonb not null,
  indexed_at timestamptz not null default now()
);

create table if not exists predict_trade_events (
  event_id text primary key,
  kind text not null check (kind in ('mint', 'redeem')),
  actor text not null,
  trader text,
  manager_id text not null,
  oracle_id text not null references predict_oracles (oracle_id),
  expiry_ms bigint not null,
  strike numeric not null,
  is_up boolean not null,
  quantity numeric not null,
  cost numeric,
  payout numeric,
  transaction_digest text,
  checkpoint bigint,
  timestamp_ms bigint not null,
  source text not null,
  raw jsonb not null,
  indexed_at timestamptz not null default now()
);

create index if not exists predict_trade_events_latest_idx
  on predict_trade_events (timestamp_ms desc, event_id);

create index if not exists predict_trade_events_position_idx
  on predict_trade_events (manager_id, oracle_id, expiry_ms, strike, is_up);

create index if not exists predict_trade_events_actor_idx
  on predict_trade_events (actor, manager_id, timestamp_ms desc);

create table if not exists predict_oracle_prices (
  event_id text primary key,
  oracle_id text not null references predict_oracles (oracle_id),
  spot numeric not null,
  forward numeric,
  checkpoint bigint,
  timestamp_ms bigint not null,
  source text not null,
  raw jsonb not null,
  indexed_at timestamptz not null default now()
);

create index if not exists predict_oracle_prices_oracle_time_idx
  on predict_oracle_prices (oracle_id, timestamp_ms desc);

create table if not exists predict_oracle_svi (
  event_id text primary key,
  oracle_id text not null references predict_oracles (oracle_id),
  a numeric not null,
  b numeric not null,
  rho numeric not null,
  rho_negative numeric not null,
  m numeric not null,
  m_negative numeric not null,
  sigma numeric not null,
  checkpoint bigint,
  timestamp_ms bigint not null,
  source text not null,
  raw jsonb not null,
  indexed_at timestamptz not null default now()
);

create index if not exists predict_oracle_svi_oracle_time_idx
  on predict_oracle_svi (oracle_id, timestamp_ms desc);

create table if not exists predict_position_summaries (
  position_id text primary key,
  owner text not null,
  manager_id text not null,
  oracle_id text not null references predict_oracles (oracle_id),
  expiry_ms bigint not null,
  strike numeric not null,
  is_up boolean not null,
  minted_quantity numeric not null,
  redeemed_quantity numeric not null,
  open_quantity numeric not null,
  cost numeric not null,
  payout numeric not null,
  realized_pnl numeric not null,
  status text not null check (status in ('open', 'closed')),
  last_event_ms bigint not null,
  materialized_at timestamptz not null default now()
);

create index if not exists predict_position_summaries_owner_idx
  on predict_position_summaries (owner, last_event_ms desc);

create table if not exists predict_ingest_cursors (
  source text primary key,
  last_checkpoint bigint,
  last_timestamp_ms bigint,
  last_seen_at timestamptz not null default now(),
  lag_ms bigint,
  error text
);

create table if not exists predict_indexer_jobs (
  job_name text primary key,
  source text not null,
  poll_interval_ms integer not null,
  status text not null check (status in ('ok', 'error')),
  last_poll_started_at_ms bigint not null,
  last_poll_completed_at_ms bigint,
  last_success_at_ms bigint,
  last_new_data_at_ms bigint,
  last_source_timestamp_ms bigint,
  last_checkpoint bigint,
  rows_fetched integer not null default 0,
  rows_written integer not null default 0,
  total_rows_written bigint not null default 0,
  consecutive_error_count integer not null default 0,
  last_error text,
  observed_update_gap_ms bigint,
  lag_ms bigint,
  updated_at_ms bigint not null
);

create index if not exists predict_indexer_jobs_updated_idx
  on predict_indexer_jobs (updated_at_ms desc);

create table if not exists predict_indexer_jobs (
  job_name text primary key,
  source text not null,
  poll_interval_ms bigint not null,
  status text not null check (status in ('ok', 'error')),
  last_poll_started_at_ms bigint not null,
  last_poll_completed_at_ms bigint,
  last_success_at_ms bigint,
  last_new_data_at_ms bigint,
  last_source_timestamp_ms bigint,
  last_checkpoint bigint,
  rows_fetched bigint not null,
  rows_written bigint not null,
  total_rows_written bigint not null,
  consecutive_error_count bigint not null,
  last_error text,
  observed_update_gap_ms bigint,
  lag_ms bigint,
  updated_at_ms bigint not null
);

create index if not exists predict_indexer_jobs_status_idx
  on predict_indexer_jobs (status, updated_at_ms desc);
