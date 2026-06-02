# Hot Hands

Hot Hands is a mobile-first social copy layer for DeepBook Predict. The core loop is simple: discover real BTC UP/DOWN wallets that are heating up, arm a watch on their next DeepBook Predict trade, and copy with your own chosen amount after Hot Hands prepares the transaction.

This repository now has the Stage 1 fake-data vertical slice, the Stage 2 simulated realtime loop, and the first Stage 3 DeepBook Predict testnet bridge: deterministic mobile replay, worker-shaped table activity, an in-process socket contract, optional PWA live-mode checks, a local Wrangler-backed worker smoke, a Predict server read canary, and Sui SDK transaction builders for manager creation, quote deposit, and copied mint.

## Testnet Quickstart

Prerequisites:

- Bun installed locally
- Chromium installed for Playwright only if you plan to run browser tests

Install dependencies:

```bash
bun install
```

Start the local testnet API and PWA together:

```bash
bun run dev:testnet
```

Then open:

```text
http://127.0.0.1:5176
```

The launcher starts:

- PWA: `http://127.0.0.1:5176`
- API: `http://127.0.0.1:8789`
- Market heat API: `http://127.0.0.1:8789/testnet/market-heat`

With `dev:testnet`, the app opens directly in `Testnet` mode and shows live DeepBook Predict market heat rows.
If public testnet reads fail, the API falls back to captured rows and labels the
source as `Captured`. Market Heat opens in `Latest` order and refreshes while
Testnet mode is open so live public trades are easier to watch, with a `Heat`
toggle for the provisional score ranking.

Useful checks:

```bash
bun run verify:fast
bun run verify:testnet
```

Install the Playwright browser before running e2e checks on a fresh machine:

```bash
bunx playwright install chromium
```

Port overrides:

```bash
HOT_HANDS_TESTNET_API_PORT=8790 HOT_HANDS_TESTNET_PWA_PORT=5177 bun run dev:testnet
```

## Current Demo Status

What is live today:

- `Testnet` reads public DeepBook Predict testnet activity through the local API.
- `Latest` shows the newest observed active trader rows first and refreshes every 10 seconds while the app is open.
- Rows are grouped by trader/manager, so a repeat trade moves that row upward instead of creating a duplicate feed item.
- On wallet connect, the PWA checks whether the user already has a
  `PredictManager`; if one is missing, the wallet bar is the place to create it.
  Trade surfaces assume that account setup has happened before preparing a
  quoted `predict::mint` transaction.

What is still in progress:

- `Heat` is a provisional activity/performance score, not the final settled reputation model.
- DUSDC deposit setup and Feed tab copy transactions are still in progress.

## Product Loop

1. Hot Hands reads real DeepBook Predict mints/redeems and finds active BTC traders.
2. The home page ranks provisional hot wallets by recent activity, realized performance, streak, and size.
3. A user arms "watch next trade" for a trader address or `PredictManager`.
4. When that trader mints a new BTC UP/DOWN position, Hot Hands prepares a copy transaction with the user's sizing rules.
5. The user signs and executes their own DeepBook Predict mint.
6. Hot Hands tracks the copied trade through redeem/settlement and updates wallet heat, copy volume, and eventually native reputation.

Hot Hands-native pre-trade signals remain the richer social layer after this
external-wallet loop is working. They should improve attribution and latency,
but the MVP should not wait for native leaders before the app feels alive.

## Planned Stack

- Mobile PWA: React, Vite, TypeScript
- Realtime: Cloudflare Workers and Durable Objects
- Chain: Sui Move plus DeepBook Predict testnet
- App data: Postgres
- Tooling: Bun as package manager and script runner
- Verification: Vitest, Cloudflare Workers Vitest pool, Playwright, Sui Move tests, and scripted demo scenarios

## Repo Map

- `apps/pwa`: mobile PWA
- `apps/api-worker`: Cloudflare Worker API and Durable Objects
- `packages/contracts`: Hot Hands Move package
- `packages/shared`: shared TypeScript schemas, constants, and scoring types
- `packages/indexer`: DeepBook Predict and Hot Hands event indexer
- `packages/demo-runner`: scripted fake users, spectators, signals, and settlements
- `packages/fixtures`: deterministic test data and recorded testnet fixtures
- `packages/e2e`: Playwright and performance verification harness

## Verification

The current local gates are:

```bash
bun run demo:play opening-night
bun run dev:live
bun run demo:push-activity opening-night
bun run verify:fast
bun run verify:realtime:sim
bun run verify:testnet
bun run --cwd packages/e2e test:worker-live
```

`verify:realtime:sim` runs worker protocol/state tests, demo realtime trace tests,
the realtime stream contract, the mocked live-mode PWA check, and the mobile
Playwright copy loop. `test:worker-live` is the heavier optional smoke that
starts Wrangler and the PWA, then verifies a real local worker WebSocket
broadcast reaches the mobile UI. On a fresh machine, install the browser binary
first:

For manual live demos, run `bun run dev:live` in one terminal and
`bun run demo:push-activity opening-night` in another. The first command starts
the local worker and PWA with live mode enabled; the second streams fixture
activity through the worker.

```bash
bunx playwright install chromium
```

Stage 3 `verify:testnet` now runs the public Predict server read canary and a
no-funds Sui testnet dev-inspect of the `predict::create_manager` transaction
builder. Full DUSDC deposit and copied mint dry-runs still need funded testnet
wallet objects.

In this local Codex workspace, the project folder contains a space, so final Vite/Playwright verification is safest from a clean no-space worktree under `/private/tmp/hot-hands-worktrees`. See `SPRINT-01.md`, `ROADMAP.md`, `SPEC.md`, `ARCHITECTURE.md`, and `AGENTS.md` for the build plan.
