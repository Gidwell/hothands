# Hot Hands API Worker

Cloudflare Worker and Durable Object package.

Primary responsibilities:

- HTTP API
- WebSocket upgrades
- Durable Object table presence
- table delta broadcasts
- transaction preparation endpoints
- rate limiting and auth/session checks

## Stage 2 Simulated Realtime Skeleton

This package owns the first local/dev friendly Cloudflare Worker loop:

- `GET /health`
- `GET /testnet/market-heat`
- `GET /tables/:tableId/summary`
- `GET /tables/:tableId/ws`

`TableRoom` is a Durable Object keyed by table id. It keeps spectator and armed
copy counts in memory, accepts JSON WebSocket messages, and broadcasts table
deltas to connected clients. It intentionally avoids Postgres and does not
persist heartbeat traffic.

### WebSocket Messages

Client messages:

```json
{ "type": "join", "spectatorId": "demo-user-1" }
{ "type": "ping", "nonce": "optional-client-nonce" }
{ "type": "arm_copy", "leaderId": "leader-1" }
{ "type": "disarm_copy" }
```

Server messages:

```json
{ "type": "welcome", "table": { "tableId": "btc-demo", "spectatorCount": 1, "armedCount": 0, "updatedAtMs": 1778700000000 }, "spectatorId": "demo-user-1" }
{ "type": "pong", "atMs": 1778700000000, "nonce": "optional-client-nonce" }
{ "type": "table_delta", "tableId": "btc-demo", "atMs": 1778700000000, "spectatorCount": 2, "armedCount": 1, "event": "copy_armed" }
```

Stage 2 also supports JSON-safe `table_activity` messages using the shared
`RealtimeActivityTraceItem` shape from `@hot-hands/shared`:

- `signal_landed`
- `copy_submitted`
- `copy_executed`
- `settlement_posted`
- `hot_hand_updated`

The demo runner emits these events from fixture replay data. The worker protocol
validates the same shape so the PWA can later consume simulated and indexed
activity without a translation layer.

## Stage 3 Testnet Read Projection

`GET /testnet/market-heat` returns the PWA's compact read-only Testnet mode
projection. The route first tries live DeepBook Predict public testnet reads via
the indexer package and returns `source: "live_testnet"` when recent activity is
available. If Predict reads fail or return no usable rows, the route falls back
to deterministic captured activity labelled with `source: "captured_testnet"`.
Live rows are ranked from the recent BTC Predict event stream, so different
expiry buckets can appear together.

Rows use the browser-facing input shape:

```json
{
  "id": "live-0xmanager-0xwallet-mint:digest:2",
  "wallet": "0xwallet",
  "manager": "0xmanager",
  "market": "BTC-USD",
  "side": "UP",
  "strike": 78098,
  "expiryMs": 1779340500000,
  "intervalLabel": "15m",
  "heatScore": 91,
  "status": "copy_ready"
}
```

`status: "copy_ready"` means a recent mint exists and the PWA can present
`Copy now` for a user-signed copy. `status: "watching"` means the row is still
copyable as `Copy next`, but the app waits for the trader's next observed mint.
Heat ranks rows; it does not gate copying.

### Local Commands

```bash
bun run --cwd apps/api-worker dev
bun run --cwd apps/api-worker dev:testnet
bun run --cwd apps/api-worker typecheck
bun run --cwd apps/api-worker test:worker
```

`dev:testnet` starts a local Bun server on `127.0.0.1:8789` by default and
serves `GET /testnet/market-heat` without requiring Cloudflare Durable Object
bindings. Override the port with `HOT_HANDS_TESTNET_API_PORT`.
