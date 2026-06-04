# Hot Hands

Hot Hands is a mobile-first social copy/fade layer for DeepBook Predict. The core loop is simple: discover real BTC UP/DOWN wallets that are heating up, watch their latest trades, and either mirror or fade them with your own chosen amount after Hot Hands prepares the transaction.

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
- Open-position close quote API: `http://127.0.0.1:8789/testnet/redeem-quote`

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

## Durable Indexer Local Notes

The durable indexer now has a DB writer, bounded public Predict backfill CLI,
Postgres readers, and API/PWA read-path hooks. Keep the local shape simple and
explicit:

- set `DATABASE_URL` to a local Postgres database before running DB-backed
  indexer work; do not commit real credentials
- run migrations manually against that database until a root migration command
  is wired
- run the bounded Predict backfill CLI with `bun run indexer:backfill:predict -- --dry-run`
  first, then with `--write` once migrations are applied
- keep the data path as: public DeepBook Predict server -> Postgres raw tables
  -> compact projections -> API worker endpoints -> PWA Feed, Trade,
  Portfolio, and chart views

When `DATABASE_URL` is set for `bun run dev:testnet`, the local API prefers
indexed reads for Market Heat, Trade markets, Portfolio events, and oracle price
history. The chart requests up to 10,000 indexed/downsampled points and includes
the full stored range metadata. Public Predict, captured rows, and direct Sui
event reads remain fallbacks when the indexer is unavailable.

## Current Demo Status

What is live today:

- `Testnet` reads indexed DeepBook Predict activity through the local API when
  `DATABASE_URL` is set, with public/captured fallbacks when it is not.
- `Latest` shows the newest observed active trader rows first and refreshes every 10 seconds while the app is open.
- Rows are grouped by trader/manager, so a repeat trade moves that row upward instead of creating a duplicate feed item.
- On wallet connect, the PWA checks whether the user already has a
  `PredictManager`; if one is missing, the wallet bar is the place to create it.
  Trade surfaces assume that account setup has happened before preparing a
  quoted `predict::mint` transaction.
- Portfolio prefers indexed manager events when the local API has an indexer
  reader, then falls back to direct Sui event reads. For settled expired
  positions, it shows the oracle settlement price plus the claim value before
  sending the wallet action.
- The BTC oracle chart can render indexed, downsampled full-history price data
  instead of only the current public Predict response window.
- Open positions show an estimated close value from the local testnet redeem
  quote before sending the wallet action.

What is still in progress:

- `Heat` is a provisional activity/performance score, not the final settled reputation model.
- Feed copy/fade attribution is not yet backed by a Hot Hands database.
- Production hosting still needs a deployed indexer/API topology; the local
  testnet app already has the indexed read-path hooks behind `DATABASE_URL`.
- Profiles, X linking, SuiNS-backed display names, follows, copy counts, fade counts, and durable leaderboards are not wired in yet.

## Product Loop

1. Hot Hands reads real DeepBook Predict mints/redeems and finds active BTC traders.
2. The home page ranks provisional hot wallets by recent activity, realized performance, streak, size, and social demand.
3. A user selects a trader, position, or profile and chooses to copy or fade.
4. Copy mirrors the source side; fade takes the opposite side at the same oracle, expiry, and strike.
5. The user signs and executes their own DeepBook Predict mint.
6. Hot Hands verifies the transaction against the source trade and records the social trade action.
7. Hot Hands tracks the trade through redeem/settlement and updates wallet heat, copy/fade volume, position stats, and reputation.

Hot Hands-native pre-trade signals remain the richer social layer after this
external-wallet loop is working. They should improve attribution and latency,
but the MVP should not wait for native leaders before the app feels alive.

## Social Data Direction

DeepBook Predict stays the source of truth for market execution, settlement, and payouts. Hot Hands adds the social layer in Postgres:

- shadow profiles for every observed trader wallet or `PredictManager`
- claimed profiles when a wallet connects
- SuiNS lookup/cache for unclaimed wallets with `.sui` names
- X account linking for claimed profiles
- follows and watched traders
- copy/fade intents and executions tied to Sui transaction digests
- position-level copy and fade counts
- trader-level copy and fade counts
- score snapshots for streaks, leaderboards, and Heat

For the hackathon, copy/fade attribution can be DB-verified by matching the follower's transaction digest back to the source trade parameters. A tiny Move event package can still be added later for cleaner chain-native proof, but it should not block profiles, leaderboards, or copy/fade counts.

Indexer read path: run bounded, high-limit public Predict server backfills for
oracles, mints, redeems, trades, prices, and SVI into raw Postgres tables, then
serve compact projections for market heat, recent activity, portfolio events,
and full-range downsampled chart history. No cursor paging has been found on the
public endpoints yet, so backfills should stay idempotent, timestamp-aware, and
easy to replay.

## Planned Stack

- Mobile PWA: React, Vite, TypeScript
- Realtime: Cloudflare Workers and Durable Objects
- Chain: DeepBook Predict testnet plus optional Sui Move proof events
- App data: Postgres for profiles, social trade attribution, copy/fade counts, and score snapshots
- Tooling: Bun as package manager and script runner
- Verification: Vitest, Cloudflare Workers Vitest pool, Playwright, Sui Move tests, and scripted demo scenarios

## Repo Map

- `apps/pwa`: mobile PWA
- `apps/api-worker`: Cloudflare Worker API and Durable Objects
- `packages/contracts`: DeepBook Predict transaction builders and optional Hot Hands Move proof package
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
