# Sprint 01: Fake Data Vertical Slice

Start date: May 13, 2026

## Goal

Build the first deterministic local Hot Hands loop:

```text
open mobile table -> spectators visible -> arm copy-next-signal -> leader signal lands -> fake settlement -> leaderboard changes
```

This sprint should make the product feel real before DeepBook testnet execution is required.

## Current Checkpoint

Completed on `codex/hot-hands-stage-1`:

- Mobile table shell with spectator rail, hot trader cards, and copy-next controls.
- PWA copy model tests for amount changes, trader selection, and arm/disarm state.
- Demo fixtures for `opening-night`, `trap-streak`, and `hot-hand-swing`.
- Scoring tests for win/loss settlement, trap streaks, ranked hot hands, and leader swings.
- Worker protocol tests, table summary delta tests, and heartbeat policy tests.
- Browser smoke test for the integrated mobile UI and copy controls.

Next loop:

- PWA live replay of signal/copy/settlement/leaderboard changes.
- Demo-runner replay frames that bridge trace events to UI animation data.
- Worker table state that preserves copy-next leader IDs and per-leader armed counts.

## Parallel Workstreams

### Agent A: PWA Shell

Ownership:

- `apps/pwa/**`

Deliverables:

- React/Vite/TypeScript mobile app shell.
- Hot table screen with market strip, spectator rail, trader cards, and copy tray.
- Static mock data if shared fixtures are not ready yet.
- Local dev/build scripts.

Verification:

```bash
cd apps/pwa
bun run build
```

### Agent B: Realtime Table Skeleton

Ownership:

- `apps/api-worker/**`

Deliverables:

- Cloudflare Worker entrypoint.
- `TableRoom` Durable Object.
- Health route.
- Table summary route.
- WebSocket upgrade route.
- Join, ping, arm copy, disarm copy messages.
- In-memory spectator and armed counts.

Verification:

```bash
cd apps/api-worker
bun run test
```

### Agent C: Fixtures, Shared Types, Demo Runner

Ownership:

- `packages/shared/**`
- `packages/fixtures/**`
- `packages/demo-runner/**`

Deliverables:

- Shared table/signal/trader/scoring types.
- Pure hot-score and settlement helpers.
- `opening-night` fixture.
- `trap-streak` fixture.
- Demo trace generator.

Verification:

```bash
cd packages/shared
bun run test
cd ../demo-runner
bun run demo opening-night
```

## Integration Order

1. Review `packages/shared` types and fixtures.
2. Point PWA mock data at shared fixtures.
3. Point Worker summary responses at shared table snapshot shape.
4. Add root scripts for package-level verification.
5. Add Playwright e2e once the local UI and fake scenario are stable.

## Definition Of Done

- The app renders the first mobile hot table locally.
- The demo runner can produce an event trace for `opening-night`.
- The Worker can accept a local WebSocket connection and update table presence.
- `verify:fast` is upgraded from placeholders to real package checks where available.
- No package writes outside assigned ownership.
