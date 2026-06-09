# Hot Hands Architecture

Last updated: June 4, 2026

## System Overview

```text
Mobile PWA
  |
  | HTTP + WebSocket
  v
Cloudflare Worker API
  |
  | routes table traffic
  v
Durable Object per active table
  |
  | ephemeral deltas
  v
Mobile clients

Indexer / Scoring Worker
  |
  | reads
  v
DeepBook Predict server + Sui RPC + optional Hot Hands events
  |
  | writes durable projections
  v
Postgres
```

## Components

### Mobile PWA

Responsibilities:

- Render table-first mobile UI.
- Consume shared deterministic replay frames in fixture mode.
- Connect wallet or zkLogin flow.
- Create or edit claimed profile state.
- Link X account for claimed profiles.
- Subscribe to table WebSocket.
- Arm watch-next-trade rules for external Predict traders.
- Arm copy-next-signal rules for Hot Hands-native leaders after native signals
  exist.
- Choose mirror-copy or fade for observed Predict positions.
- Sign and execute prepared copy/fade transactions.
- Show hot tables, trader cards, copy tray, and settlement moments.

### Worker API

Responsibilities:

- Auth/session verification.
- Profile, follow, and social-ledger APIs.
- X account linking callback/verification flow.
- SuiNS display-name lookup/cache refresh.
- Route table WebSocket upgrades to Durable Objects.
- Serve table summaries and hot feeds.
- Prepare copy/fade transaction payloads.
- Validate copy constraints before transaction construction.
- Rate-limit suspicious clients.

### Durable Object Table

One active table maps to one Durable Object.

Responsibilities:

- Track connected spectators.
- Track armed copy counts and state.
- Broadcast table deltas.
- Batch and debounce frequent updates.
- Avoid durable writes on ordinary heartbeats.

Stored in memory or Durable Object storage:

- connection attachments
- active spectator count
- armed count
- recent table events
- last broadcast snapshot

Never store every heartbeat in Postgres.

Stage 1 note:

- Fake spectator simulation currently verifies table-state behavior in pure Worker tests. Actual WebSocket broadcast load tests are still future `verify:perf` work.

Stage 2 note:

- Worker `table_activity` messages are validated and broadcast through the
  table Durable Object path.
- The fast realtime stream verifier is an in-process socket contract, and the
  optional `packages/e2e test:worker-live` gate starts Wrangler plus the PWA to
  prove a real local worker WebSocket broadcast reaches the browser.
- The PWA can open an optional worker WebSocket subscription behind
  `VITE_HOT_HANDS_API_URL` and falls back to replay activity when live mode is
  unavailable.

### Postgres

Durable data:

- users and profiles
- wallet identities and claimed profile links
- X account links
- SuiNS name cache
- watched external traders
- watch rules
- observed Predict trades
- signals
- copy rules
- copy receipts or trade action receipts
- copy/fade intents
- copy/fade executions
- position-level copy/fade stats
- trader-level copy/fade stats
- resolved signal outcomes
- score snapshots
- indexed DeepBook trade projections
- raw Predict backfill tables
- derived and downsampled PWA feed projections
- demo scenario traces

### Identity And Profiles

Hot Hands needs useful identities before every observed trader creates a
profile. The database should support three states:

- `shadow`: created from observed DeepBook Predict activity; display `.sui`
  when SuiNS resolves, otherwise shortened address.
- `claimed`: wallet-connected user has signed in and can edit profile fields.
- `x_linked`: claimed profile has a verified X account handle/avatar link.

Profile display fallback order:

```text
claimed display name -> linked X handle -> SuiNS name -> shortened wallet
```

SuiNS is a cacheable enrichment, not the account authority. Wallet ownership is
the authority for claiming/editing a profile.

### Copy And Fade Ledger

Hot Hands social trade actions are stored offchain first and verified against
Sui transaction results.

Core action fields:

- `action_type`: `mirror` or `fade`
- `source_wallet`
- `source_manager_id`
- `source_digest`
- `source_event_seq`
- `source_oracle_id`
- `source_expiry`
- `source_strike`
- `source_side`
- `follower_wallet`
- `follower_manager_id`
- `executed_side`
- `copy_tx_digest`
- `quantity`
- `cost`
- `status`

Mirror-copy uses the same side as the source trade. Fade uses the opposite side
at the same oracle, expiry, and strike. After wallet submission, the indexer
must verify that `copy_tx_digest` actually minted the expected side and market
for the follower before the action counts toward stats or Heat.

### Indexer / Scoring Worker

Responsibilities:

- Poll or stream DeepBook Predict data.
- Index Hot Hands events.
- Verify copy/fade executions against Sui transaction digests.
- Run high-limit public Predict server backfills for oracles, mints, redeems,
  trades, prices, and SVI.
- Store raw Predict rows before deriving compact projections.
- Normalize public Predict mints, redeems, prices, SVI, and per-oracle trades.
- Serve heavy feed projections through a short API cache and keep 1-second
  price/market model refreshes on a lightweight snapshot endpoint.
- Compute external wallet market heat before Hot Hands-native reputation exists.
- Resolve signals when oracles settle.
- Compute trader, table, and squad score snapshots.
- Maintain hot-feed cache.

### Move Contracts

Move is optional for the first DB-backed social ledger. DeepBook Predict remains
the execution layer, and Postgres can provide verified product attribution by
linking source trades to follower transaction digests.

Optional proof-event scope:

- emit profile and social events
- emit signal events
- emit copy/fade rule and receipt proof
- avoid pooled custody
- avoid automatic delegated trading

DeepBook Predict remains the execution layer.

## DeepBook Predict Integration

Current public integration targets live in the indexer read canary config. Official DeepBook Predict docs checked May 19, 2026 are pinned to `predict-testnet-4-16` and warn that package IDs, object layouts, and entrypoints are provisional before mainnet:

- network: Sui Testnet
- Predict server: `https://predict-server.testnet.mystenlabs.com`
- Predict package: `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138`
- Predict registry: `0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64`
- Predict object: `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a`
- quote asset DUSDC: `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC`

Data-source guidance:

- Use the public Predict server for render-ready read-canary data.
- Use high-limit public Predict server reads for the first DB-backed backfills:
  oracles, mints, redeems, per-oracle trades, indexed prices, and SVI.
- Use the public Predict server history endpoints for recent testnet trade
  activity:
  - `/positions/minted`
  - `/positions/redeemed`
  - `/trades/:oracle_id`
- No cursor paging has been found on these public endpoints yet. Treat backfill
  jobs as bounded snapshots with idempotent upserts and explicit freshness
  checks until a cursor or checkpoint source exists.
- Use Sui events/checkpoints for low-latency oracle updates when the indexer needs fresher settlement signals.
- Use direct onchain reads around wallet flows, manager state, deposits, and transaction confirmation.
- Keep live SVI polling latest-only by default; broad SVI history belongs in
  bounded backfill/replay jobs, not every 1-second live tick.

Testnet trade read mode:

- The first real-data PWA mode can use local API reads while the indexer is
  bootstrapping, but the target path is indexed and downsampled projections
  instead of direct public-server reads.
- The PWA should consume normalized Predict trade rows, then render recent BTC
  mints/redeems as table activity.
- Raw `trader` and `manager_id` values can seed provisional trader cards, but
  they are not Hot Hands identities yet.
- Raw mint/redeem activity can support a "who is active" or "who is pressing"
  feed and provisional `Market Heat` rankings.
- A user can arm a watch against an external trader or manager. When the indexer
  observes the next matching Predict mint, the backend can prepare a user-signed
  mirror-copy or fade transaction. This is reactive action from an observed
  mint, not pre-trade execution.
- Do not present external wallet heat as final Hot Hands reputation until Hot
  Hands signal records, copy/fade executions or receipts, and
  settlement-aware scoring are linked.
- Keep fixture/replay mode visually distinct from testnet mode so demos do not
  blur simulated copy behavior with real testnet market activity.

Transaction-builder checkpoint:

- `packages/contracts` exports Sui SDK builders for `predict::create_manager`,
  `predict_manager::deposit<Quote>`, and an existing-manager copied
  `predict::mint<Quote>`.
- The copied mint builder constructs `market_key::new(oracle_id, expiry, strike,
  is_up)` and then calls `predict::mint(predict, manager, oracle, key, quantity,
  clock)`.
- `verify:testnet` dev-inspects `predict::create_manager` against Sui Testnet
  without a funded wallet. Deposit and mint dry-runs remain gated on real gas,
  DUSDC, a user-owned `PredictManager` shared object, and a live oracle.

Integration sequence:

1. Read active BTC oracles from the public Predict server.
2. Validate response shape and config overrides without requiring credentials.
3. Select market and strike.
4. Read recent testnet mints/redeems and per-oracle trade history.
5. Normalize external trader and manager activity into `Market Heat`.
6. Render a PWA testnet-read mode with watch/copy controls clearly labeled as
   reactive and user-signed.
7. Build and snapshot SDK transactions for manager setup, quote deposit, and
   mint payloads.
8. Find or create user `PredictManager`.
9. Ensure DUSDC deposit.
10. Prepare a mirror-copy or fade when a watched external trader's next mint appears.
11. Execute with user signature.
12. Read back indexed mint event.
13. Link event to a Hot Hands watch rule, source trade, and copy/fade ledger row.

## Realtime Presence

Presence is connection-based:

```text
WebSocket connected = present
foreground ping = 5-10s
background ping = 30-60s or disconnect
inactive timeout = 30-45s
```

Broadcast only changes:

- `spectator_joined`
- `spectator_left`
- `copy_armed`
- `copy_disarmed`
- `signal_landed`
- `copy_submitted`
- `copy_executed`
- `settlement_posted`
- `hot_hand_updated`
- `hot_score_updated`

## Demo Data Flow

Stage 1 established the local replay path and Stage 2 added worker-shaped
activity:

```text
packages/fixtures
  -> packages/demo-runner replay frames
  -> packages/demo-runner realtime activity traces
  -> apps/api-worker table_activity protocol
  -> apps/pwa replay adapter
  -> apps/pwa activity stream parser
  -> packages/e2e mobile flow
```

Keep this path intact as Stage 3 adds replayed testnet data and live testnet
bot mode. New demo scenarios should start in fixtures, then flow outward through
the same adapters.

## Performance Budgets

Initial budgets:

- heartbeat acknowledgement p95 under 250ms in staging
- broadcast p95 under 500ms in staging
- missed heartbeat rate under 1 percent
- no Postgres write per heartbeat
- home page subscribes only to visible hot tables

Scaling strategy:

- lazy-create active tables
- keep cold tables as Postgres/cache snapshots
- shard a mega-table only if needed

## Security Notes

- Do not custody user funds in MVP.
- Do not execute copy trades without user signature.
- Validate all prepared transactions against explicit copy constraints.
- Treat DeepBook Predict package IDs as testnet-provisional.
- Separate fixture/replay/live modes clearly in UI and logs.

## Local Tooling Notes

- Bun remains the package/script runner.
- In this Codex desktop workspace, the project path contains a space. Vite/esbuild has intermittently hung in that path, so final build/e2e verification should run from a clean no-space worktree under `/private/tmp/hot-hands-worktrees` until the project is moved or CI owns verification.
