# Hot Hands API Worker

Cloudflare Worker and Durable Object package.

Primary responsibilities:

- HTTP API
- WebSocket upgrades
- Durable Object table presence
- table delta broadcasts
- transaction preparation endpoints
- rate limiting and auth/session checks

## Stage 1 Realtime Skeleton

This package owns the first local/dev friendly Cloudflare Worker loop:

- `GET /health`
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

### Local Commands

```bash
bun run --cwd apps/api-worker dev
bun run --cwd apps/api-worker typecheck
bun run --cwd apps/api-worker test:worker
```
