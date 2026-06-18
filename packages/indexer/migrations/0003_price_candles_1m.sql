-- One-minute BTC oracle price candles.
--
-- Raw price ticks are useful for near-term charts, but long-running active
-- markets can create too many 1-second rows. These candles preserve the data
-- needed for future candlestick charts before old raw ticks are pruned.

create table if not exists predict_oracle_price_candles_1m (
  oracle_id text not null references predict_oracles (oracle_id),
  bucket_ms bigint not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  forward_open numeric,
  forward_high numeric,
  forward_low numeric,
  forward_close numeric,
  sample_count integer not null,
  first_timestamp_ms bigint not null,
  last_timestamp_ms bigint not null,
  first_checkpoint bigint,
  last_checkpoint bigint,
  source text not null,
  updated_at timestamptz not null default now(),
  primary key (oracle_id, bucket_ms)
);

create index if not exists predict_oracle_price_candles_1m_oracle_time_idx
  on predict_oracle_price_candles_1m (oracle_id, bucket_ms desc);
