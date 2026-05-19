# Hot Hands

Hot Hands is a mobile-first social prediction market app for DeepBook Predict. The core loop is simple: watch live BTC prediction tables, find traders with a hot hand, arm a copy-next-signal rule, and execute the copy trade with your own chosen amount.

This repository now has the Stage 1 fake-data vertical slice and the Stage 2 simulated realtime loop: deterministic mobile replay, worker-shaped table activity, an in-process socket contract, optional PWA live-mode checks, and a local Wrangler-backed worker smoke before pushing into full DeepBook testnet execution.

## Product Loop

1. A leader posts a pre-trade signal for an active BTC UP/DOWN market.
2. Spectators gather around the table and can arm copy-next-signal rules.
3. When the leader signal becomes actionable, followers receive a prepared copy trade.
4. The follower signs and executes the copy on DeepBook Predict testnet.
5. Hot Hands emits social proof, resolves the signal after settlement, and updates streaks, ROI, PnL, copy volume, and table heat.

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
bun run verify:fast
bun run verify:realtime:sim
bun run --cwd packages/e2e test:worker-live
```

`verify:realtime:sim` runs worker protocol/state tests, demo realtime trace tests,
the realtime stream contract, the mocked live-mode PWA check, and the mobile
Playwright copy loop. `test:worker-live` is the heavier optional smoke that
starts Wrangler and the PWA, then verifies a real local worker WebSocket
broadcast reaches the mobile UI. On a fresh machine, install the browser binary
first:

```bash
bunx playwright install chromium
```

In this local Codex workspace, the project folder contains a space, so final Vite/Playwright verification is safest from a clean no-space worktree under `/private/tmp/hot-hands-worktrees`. See `SPRINT-01.md`, `ROADMAP.md`, `SPEC.md`, `ARCHITECTURE.md`, and `AGENTS.md` for the build plan.
