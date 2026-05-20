# Hot Hands Testing And Verification

Last updated: May 19, 2026

## Test Pyramid

```text
Move unit tests
TypeScript unit tests
Worker/Durable Object runtime tests
API contract tests
Playwright mobile e2e
Performance simulations
Testnet canary flows
```

## Verification Commands

### `verify:fast`

Runs on every meaningful change.

Current checks:

- TypeScript typecheck.
- Unit tests.
- Durable Object tests.
- PWA production build.
- Worker production build.

Later stages will add lint, Move tests, and wallet-backed mint dry-runs.

### `verify:realtime:sim`

Runs the simulated realtime gate.

Current Stage 2 checks:

- Worker protocol, table-state, heartbeat, and activity broadcast tests.
- Demo-runner realtime trace tests.
- E2E realtime contract that posts an `opening-night` fixture trace while a
  table socket is subscribed.
- Mocked PWA live-mode Playwright check that verifies WebSocket URL, join
  payload, live status, and rendered activity without starting Wrangler.
- Playwright mobile copy loop.

This gate proves the fixture-shaped realtime loop without requiring testnet or
a production worker server.

### `verify:e2e`

Runs the local deterministic app.

Expected checks:

- open mobile viewport
- enter hot table
- see spectators
- arm one-shot copy intent
- receive fixture signal or observed trade
- execute fake copy
- settle fake market
- assert streak and leaderboard update

Stage 1 implementation:

- `packages/e2e` uses Playwright with a Pixel 7 profile.
- The test starts the PWA dev server, opens the app, arms copy, advances replay, confirms copy execution, settlement, and leaderboard update.
- Fresh machines may need the browser cache populated first:

```bash
bunx playwright install chromium
```

Local note: if Vite/esbuild hangs in a workspace path with spaces, run verification from a clean no-space worktree such as `/private/tmp/hot-hands-worktrees/integration-verify`.

### `packages/e2e test:realtime`

Runs only the realtime stream contract:

```bash
bun run --cwd packages/e2e test:realtime
```

Expected checks:

- construct the worker and `TableRoom` in-process
- subscribe to a table WebSocket
- post fixture `table_activity`
- assert ordered activity broadcasts and `hot_score_updated` deltas

It is intentionally lighter than a Wrangler/workerd smoke, so keep it as the
fast protocol guard.

### `packages/e2e test:worker-live`

Runs the optional local worker-backed smoke:

```bash
bun run --cwd packages/e2e test:worker-live
```

Expected checks:

- start the real API Worker through Wrangler
- start the PWA with `VITE_HOT_HANDS_API_URL` pointed at that worker
- open the mobile PWA without mocking `WebSocket`
- post fixture `table_activity` to `/tables/btc-15m/activity`
- assert the PWA shows `Live` and renders the worker broadcast

This gate is heavier than `verify:realtime:sim` and may need local loopback
permissions in sandboxed environments. Set `HOT_HANDS_E2E_NODE_PATH` if
Wrangler needs a specific Node 22+ binary.

### `verify:perf`

Runs spectator and heartbeat load scenarios.

Expected checks:

- 500 spectators baseline
- 1,000 spectators target
- 5,000 spectators stretch
- heartbeat ack p50/p95
- broadcast p50/p95
- reconnect rate
- missed heartbeat rate

### `verify:testnet`

Current checkpoint: DeepBook Predict testnet read canary plus transaction
builder dev-inspect.

Current scope:

- read public Predict server status and Predict object state
- read active BTC oracle data
- read the selected BTC oracle's latest indexed price
- snapshot Sui SDK transactions for manager creation, quote deposit, and copied
  mint
- dev-inspect `predict::create_manager` on Sui testnet without funded wallet
  objects
- avoid funded wallet, DUSDC mint/deposit execution, copied mint execution, or
  Hot Hands write flows

Current public target:

- Predict server: `https://predict-server.testnet.mystenlabs.com`
- Sui RPC: `https://fullnode.testnet.sui.io:443`

Optional target overrides should only be documented as required after code
implements them. Expected names are:

- `HOT_HANDS_PREDICT_SERVER_URL`
- `HOT_HANDS_PREDICT_PACKAGE_ID`
- `HOT_HANDS_PREDICT_REGISTRY_ID`
- `HOT_HANDS_PREDICT_OBJECT_ID`
- `HOT_HANDS_PREDICT_QUOTE_ASSET`
- `HOT_HANDS_PREDICT_BTC_ONLY`
- `HOT_HANDS_SUI_TESTNET_RPC_URL`
- `HOT_HANDS_DEV_INSPECT_SENDER`

Next checkpoints:

- Predict trade-history parsing for `/positions/minted`, `/positions/redeemed`,
  and `/trades/:oracle_id`
- external wallet `Market Heat` scoring from captured Predict trade rows
- PWA testnet-read mode with watch-next-trade controls using captured Predict rows
- direct onchain reads around wallet flows
- `PredictManager` find/create
- DUSDC deposit and small mint on testnet
- indexed mint readback

## Current Verification Gaps

- `verify:perf` is still a placeholder; no fanout or heartbeat load harness yet.
- `verify:testnet` dev-inspects manager creation, but deposit and mint dry-runs
  still require funded testnet wallet objects.
- Watch-next-trade is reactive for external traders. E2E should assert the UI
  does not imply pre-trade execution unless the source is a Hot Hands-native
  signal.
- Worker-backed realtime proof is local Wrangler only, not deployed Cloudflare
  infrastructure.
- Visual regression screenshots are not wired into `verify:visual`.

## Deterministic Fixtures

Fixture data should cover:

- hot trader wins 5 in a row
- trap streak wins often but loses ROI
- cold table loses twice
- whale attracts spectators
- copy volume changes rank
- signal posted too close to expiry is ignored

## Agent Done Definition

A change is done when:

- the relevant tests are added first and fail for the expected reason
- the implementation makes those tests pass without weakening the assertion
- the narrow verification command passes
- shared schemas are updated if event shapes changed
- demo fixtures still run
- the agent reports remaining risk honestly
