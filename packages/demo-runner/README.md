# Hot Hands Demo Runner

Scripted fake users and table scenarios.

Modes:

- fixture mode
- replay mode
- live testnet bot mode

The demo runner should feed the same realtime and scoring paths as production.

## Stage 2 Realtime Adapter

`produceRealtimeActivityTrace` projects deterministic replay frames into shared
`table_activity` items:

- `signal_landed`
- `copy_submitted`
- `copy_executed`
- `settlement_posted`
- `hot_hand_updated`

These events remain visibly sourced as `fixture_replay` so demo data cannot be
confused with future testnet/indexed activity.

Inspect the stream locally with:

```bash
bun run demo:play opening-night --realtime
```

## Live Worker Demo

Start the PWA and local API Worker together:

```bash
bun run dev:live
```

Then push fixture activity through the worker WebSocket path from another
terminal:

```bash
bun run demo:push-activity opening-night
```

Useful options:

```bash
bun run demo:push-activity opening-night -- --step 0
bun run demo:push-activity hot-hand-swing -- --from 3 --count 4 --interval-ms 1000
```

Environment overrides:

- `HOT_HANDS_LIVE_PWA_PORT`
- `HOT_HANDS_LIVE_WORKER_PORT`
- `HOT_HANDS_WORKER_URL`
- `HOT_HANDS_TABLE_ID`
- `HOT_HANDS_E2E_NODE_PATH`

## Testnet Dev Launcher

Start the local testnet API, PWA, and indexed read path together:

```bash
export DATABASE_URL=postgres://$USER@127.0.0.1:5432/hothands_dev
bun run dev:testnet
```

The launcher starts `apps/api-worker` with its Bun testnet server, waits for
`/health`, then starts the PWA with `VITE_HOT_HANDS_API_URL` pointed at that
local API and waits for the PWA URL to respond. It prints `Hot Hands testnet
dev is ready` only after both URLs are reachable. When `DATABASE_URL` is set,
it first applies indexer migrations, runs an idempotent bounded Predict
backfill, and then starts the dedicated live Predict indexer process. The
launcher starts API and indexer as direct Bun scripts, keeps the PWA on its
proven Vite package script, writes `.hot-hands-dev-testnet.json` with exact
child PIDs, and shuts down process groups on exit.

Defaults:

- API: `http://127.0.0.1:8789`
- PWA: `http://127.0.0.1:5176`
- Market Heat: `http://127.0.0.1:8789/testnet/market-heat`
- Indexer status: `http://127.0.0.1:8789/testnet/indexer-status`

Override ports when another local run owns the defaults:

```bash
DATABASE_URL=postgres://$USER@127.0.0.1:5432/hothands_dev HOT_HANDS_TESTNET_API_PORT=8792 HOT_HANDS_TESTNET_PWA_PORT=5184 bun run dev:testnet
```

Read-only wallet debugging is supported in the PWA with `devWallet`:

```text
http://127.0.0.1:5176/?devWallet=0x29b8e29b80f2d332f130990ebe0b3bfc99ccef6657a01858e0c25d675721cd79
```

This loads discovered manager, bankroll, PnL, portfolio, and history data for
inspection only. Wallet-signed actions still require connecting the real wallet.

If a stale local listener or Vite/esbuild process still owns the dev loop, run:

```bash
bun run dev:cleanup
```

`dev:cleanup` uses the pidfile first, then falls back to the configured ports
and repo-local Bun/Vite/esbuild commands. If the PWA repeatedly times out
before opening a port, run the app from a no-space git worktree; Vite/esbuild
has hung in paths such as `Documents/New project`.

If cleanup does not free a port, inspect the exact listener before killing it:

```bash
lsof -nP -iTCP:5176 -sTCP:LISTEN
lsof -nP -iTCP:8789 -sTCP:LISTEN
```

Only kill confirmed stale Hot Hands, Bun, Vite, or esbuild processes from this
repo or its no-space worktree.

Environment overrides:

- `DATABASE_URL`
- `HOT_HANDS_TESTNET_API_PORT`
- `HOT_HANDS_TESTNET_PWA_PORT`
- `HOT_HANDS_TESTNET_HOST`
- `HOT_HANDS_TESTNET_API_HOST`
- `HOT_HANDS_TESTNET_PWA_HOST`
- `HOT_HANDS_DEV_READY_TIMEOUT_MS`
- `HOT_HANDS_DEV_MIGRATE=false`
- `HOT_HANDS_DEV_BACKFILL=false`
- `HOT_HANDS_INDEXER_LIVE=false`
- `HOT_HANDS_INDEXER_PRICE_POLL_MS`
- `HOT_HANDS_INDEXER_POSITIONS_POLL_MS`
- `HOT_HANDS_INDEXER_TRADES_POLL_MS`
- `HOT_HANDS_INDEXER_ORACLES_POLL_MS`
- `VITE_HOT_HANDS_DEV_WALLET_ADDRESS`
