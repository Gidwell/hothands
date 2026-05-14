# Hot Hands Testing And Verification

Last updated: May 14, 2026

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

Current Stage 1 checks:

- TypeScript typecheck.
- Unit tests.
- Durable Object tests.
- PWA production build.
- Worker production build.

Later stages will add lint, Move tests, and transaction builder snapshots.

### `verify:e2e`

Runs the local deterministic app.

Expected checks:

- open mobile viewport
- enter hot table
- see spectators
- arm copy-next-signal
- receive fake signal
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

Runs only when testnet credentials and tokens are available.

Expected checks:

- read Predict server status
- read active BTC oracles
- find/create manager
- deposit DUSDC
- execute small mint
- read indexed mint
- optionally post Hot Hands signal/copy receipt

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
