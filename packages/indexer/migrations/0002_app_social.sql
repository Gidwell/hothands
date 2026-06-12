-- App-owned social/auth state.
-- These tables are separate from DeepBook Predict facts. They capture wallet
-- consent, social graph state, copy/fade attribution, and historical scoring
-- snapshots that Hot Hands owns directly.

create table if not exists app_wallet_auth_challenges (
  challenge_id text primary key,
  wallet text not null,
  nonce text not null unique,
  message text not null,
  issued_at_ms bigint not null,
  expires_at_ms bigint not null,
  consumed_at_ms bigint,
  created_at timestamptz not null default now()
);

create index if not exists app_wallet_auth_challenges_wallet_idx
  on app_wallet_auth_challenges (wallet, expires_at_ms desc);

create table if not exists app_wallet_sessions (
  session_id text primary key,
  wallet text not null,
  token_hash text not null unique,
  issued_at_ms bigint not null,
  expires_at_ms bigint not null,
  revoked_at_ms bigint,
  created_at timestamptz not null default now()
);

create index if not exists app_wallet_sessions_wallet_idx
  on app_wallet_sessions (wallet, expires_at_ms desc);

create table if not exists app_wallet_follows (
  follower_wallet text not null,
  leader_wallet text not null,
  leader_display_name text,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  deleted_at_ms bigint,
  primary key (follower_wallet, leader_wallet)
);

create index if not exists app_wallet_follows_follower_active_idx
  on app_wallet_follows (follower_wallet, updated_at_ms desc)
  where deleted_at_ms is null;

create table if not exists app_copy_receipts (
  receipt_id text primary key,
  copier_wallet text not null,
  source_wallet text not null,
  source_position_id text not null,
  copied_position_id text,
  mode text not null check (mode in ('copy', 'fade')),
  status text not null check (status in ('prepared', 'submitted', 'failed')),
  oracle_id text,
  expiry_ms bigint,
  strike numeric,
  source_side text check (source_side in ('UP', 'DOWN')),
  execution_side text check (execution_side in ('UP', 'DOWN')),
  amount_usd numeric not null,
  quote_cost numeric,
  transaction_digest text,
  created_at_ms bigint not null,
  updated_at_ms bigint not null,
  raw jsonb not null default '{}'::jsonb
);

create index if not exists app_copy_receipts_source_position_idx
  on app_copy_receipts (source_position_id, source_wallet, created_at_ms desc);

create index if not exists app_copy_receipts_copier_idx
  on app_copy_receipts (copier_wallet, created_at_ms desc);

create table if not exists app_wallet_heat_snapshots (
  wallet text not null,
  scored_at_ms bigint not null,
  heat_score numeric not null,
  source text not null,
  components jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (wallet, scored_at_ms)
);

create index if not exists app_wallet_heat_snapshots_latest_idx
  on app_wallet_heat_snapshots (wallet, scored_at_ms desc);
