# Hot Hands Architecture

Last updated: May 19, 2026

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
DeepBook Predict server + Sui RPC + Hot Hands events
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
- Subscribe to table WebSocket.
- Arm copy-next-signal rules.
- Sign and execute prepared copy transactions.
- Show hot tables, trader cards, copy tray, and settlement moments.

### Worker API

Responsibilities:

- Auth/session verification.
- Route table WebSocket upgrades to Durable Objects.
- Serve table summaries and hot feeds.
- Prepare transaction payloads.
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
- signals
- copy rules
- copy receipts
- resolved signal outcomes
- score snapshots
- indexed DeepBook trade projections
- demo scenario traces

### Indexer / Scoring Worker

Responsibilities:

- Poll or stream DeepBook Predict data.
- Index Hot Hands events.
- Resolve signals when oracles settle.
- Compute trader, table, and squad score snapshots.
- Maintain hot-feed cache.

### Move Contracts

MVP contract scope:

- emit profile and social events
- emit signal events
- emit copy rule / copy receipt proof
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
- Use the public Predict server history endpoints for recent testnet trade
  activity:
  - `/positions/minted`
  - `/positions/redeemed`
  - `/trades/:oracle_id`
- Use Sui events/checkpoints for low-latency oracle updates when the indexer needs fresher settlement signals.
- Use direct onchain reads around wallet flows, manager state, deposits, and transaction confirmation.

Testnet trade read mode:

- The first real-data PWA mode should consume normalized Predict trade rows,
  then render recent BTC mints/redeems as table activity.
- Raw `trader` and `manager_id` values can seed provisional trader cards, but
  they are not Hot Hands identities yet.
- Raw mint/redeem activity can support a "who is active" or "who is pressing"
  feed. Do not present it as final ROI, copy reputation, or copy receipts until
  Hot Hands signal records and settlement-aware scoring are linked.
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
5. Render a PWA testnet-read mode with copy disabled or preview-only.
6. Build and snapshot SDK transactions for manager setup, quote deposit, and
   mint payloads.
7. Find or create user `PredictManager`.
8. Ensure DUSDC deposit.
9. Execute with user signature.
10. Read back indexed mint event.
11. Link event to Hot Hands signal or copy receipt.

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
