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
projection. When `DATABASE_URL` is set, the local API first reads indexed
Postgres projections and returns `source: "indexed_testnet"` when usable rows
are available. If the indexer is unavailable, the route falls back to live
DeepBook Predict public testnet reads labelled `source: "live_testnet"`, then to
deterministic captured activity labelled `source: "captured_testnet"`.
The PWA uses this as a full feed resync, not the every-second live tape path.
Rows are returned newest-first from the BTC Predict event stream, so different
expiry buckets can appear together. The endpoint returns a bounded candidate
set that includes the latest traders plus high-heat traders so the PWA can
switch between `Latest` and `Heat` ordering without losing the live tape.

`GET /testnet/feed-updates?cursor=...` is the lightweight live tape path. It
returns only newly indexed BTC mint rows after the opaque cursor emitted by
`/testnet/market-heat` or the previous feed update. It intentionally omits
market metadata, pricing models, wallet stats, and copy attribution; those are
refreshed by the slower full snapshot and price snapshot paths.

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
  "observedAtMs": 1779340200000,
  "heatScore": 91,
  "status": "copy_ready"
}
```

`observedAtMs` is the latest trade or position event time displayed by the PWA
as a compact relative label. `status: "copy_ready"` means a recent mint exists
and the PWA can present `Copy now` for a user-signed copy. `status: "watching"`
means the row is still copyable as `Copy next`, but the app waits for the
trader's next observed mint. Heat ranks rows; it does not gate copying.

## App Auth And Social State

When the local API is started with `DATABASE_URL`, it also creates a
Postgres-backed Hot Hands app store. These routes are separate from read-only
DeepBook Predict projections:

- `POST /app/auth/challenge`: creates a short-lived Sui wallet personal-message
  challenge.
- `POST /app/auth/session`: verifies the signed challenge and returns a bearer
  session token. The session creation path also claims or refreshes a wallet
  profile row for the connected wallet.
- `GET /app/me`: returns the authenticated wallet profile, including private
  app settings such as `defaultStakeAmountUsd`.
- `PATCH /app/me/profile`: updates authenticated profile settings such as
  display name, bio, avatar URL, X handle, and saved default stake amount.
- `GET /app/profiles?wallet=...`: returns public profile display fields for
  feed, leaderboard, and profile overlays. It intentionally excludes private
  settings such as saved stake.
- `GET /app/follows`: lists followed wallets for the authenticated wallet.
- `POST /app/follows`: follows a leader wallet for the authenticated wallet.
- `DELETE /app/follows?leaderWallet=...`: removes a follow edge.
- `GET /app/copy-receipts`: lists persisted copy/fade attribution receipts.
- `POST /app/copy-receipts`: records a submitted Copy or Fade receipt for the
  authenticated wallet after a wallet transaction is sent.

The PWA uses local storage as a fallback for read-only/dev-wallet mode, but
server persistence requires a real connected wallet signature. Display identity
should resolve as Hot Hands profile display name, then SuiNS, then shortened
wallet address.

### Local Commands

```bash
bun run --cwd apps/api-worker dev
bun run --cwd apps/api-worker dev:testnet
bun run --cwd apps/api-worker typecheck
bun run --cwd apps/api-worker test:worker
```

`dev:testnet` starts only this package's local Bun server on `127.0.0.1:8789`
by default and serves the testnet endpoints without requiring Cloudflare Durable
Object bindings. With `DATABASE_URL`, it also exposes read-only indexer
freshness at `GET /testnet/indexer-status` and prefers indexed reads for Market
Heat, Trade markets, Portfolio events, and BTC chart history. Override the port
with `HOT_HANDS_TESTNET_API_PORT`.

For the full teammate/agent app loop, prefer the root launcher instead:

```bash
export DATABASE_URL=postgres://$USER@127.0.0.1:5432/hothands_dev
bun run dev:testnet
```

The root launcher applies migrations, runs the bounded Predict backfill, starts
this API, starts the PWA pointed at this API, and starts the live indexer.
