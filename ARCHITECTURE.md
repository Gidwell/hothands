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
- The current realtime stream verifier is an in-process socket contract, not a
  full Wrangler/workerd network smoke.
- The PWA can parse worker-shaped activity JSON, but the actual browser
  WebSocket subscription is still the next integration slice.

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

Known public integration targets should live in shared constants once implemented. Re-check official DeepBook Predict docs before coding Stage 3 because testnet package IDs and server details are provisional:

- network: Sui Testnet
- Predict server: `https://predict-server.testnet.mystenlabs.com`
- Predict object, package, registry, quote asset: from current DeepBook Predict contract docs

Integration sequence:

1. Read active oracles from Predict server.
2. Select market and strike.
3. Find or create user `PredictManager`.
4. Ensure DUSDC deposit.
5. Build mint transaction for UP/DOWN position.
6. Execute with user signature.
7. Read back indexed mint event.
8. Link event to Hot Hands signal or copy receipt.

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
