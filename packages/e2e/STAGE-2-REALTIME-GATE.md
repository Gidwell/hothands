# Stage 2 Simulated Realtime Gate

Last updated: May 18, 2026

This is the first Stage 2 verification target that does not depend on live
testnet execution or a production WebSocket harness. It protects the Stage 1
copy loop while realtime, demo activity, and protocol work continue in their
owned packages.

## Gate Command Set

Run these checks together before calling a Stage 2 realtime slice ready:

```bash
bun run verify:realtime:sim
```

Expected coverage:

- Worker protocol tests keep client message parsing, server message encoding,
  table state, and heartbeat behavior compatible with the table loop.
- Demo activity adapter tests keep replay frames browser-safe and preserve copy,
  settlement, and hot score activity needed by the PWA.
- Realtime contract tests post a fixture `table_activity` trace into the worker
  route while a table socket is subscribed, then assert ordered lifecycle
  broadcasts and hot-score deltas.
- Mocked PWA live-mode tests verify the browser subscription URL, join payload,
  live status, and rendered activity without requiring Wrangler.
- Mobile Playwright e2e keeps the existing copy-next-signal flow green through
  arm, signal, copy execution, settlement, and leaderboard update.

## Realtime Contract

The simulated realtime contract runs in-process, using the real worker fetch
route, `TableRoom`, and a small WebSocketPair-compatible harness. It does not
start a long-lived Wrangler or Miniflare server.

The contract covers:

- open a local table WebSocket
- post the `opening-night` fixture trace to `/tables/:tableId/activity`
- assert ordered `signal_landed`, `copy_submitted`, `copy_executed`,
  `settlement_posted`, and `hot_hand_updated` activity broadcasts
- assert `hot_score_updated` deltas are emitted after hot-score changes

Keep this contract small. Its job is to prove the live socket path still matches
the worker protocol tests, not to replace load or performance verification.

## Root Scripts

`verify:realtime:sim` is the fast simulated realtime gate. It runs worker
protocol/state tests, demo activity adapter tests, the realtime stream contract,
and the mobile Playwright suite together.

The realtime stream contract can also be run directly:

```bash
bun run --cwd packages/e2e test:realtime
```

The heavier local worker smoke is intentionally separate from
`verify:realtime:sim`:

```bash
bun run --cwd packages/e2e test:worker-live
```

It starts Wrangler and the PWA, points `VITE_HOT_HANDS_API_URL` at the local
worker, posts fixture activity to `/tables/btc-15m/activity`, and asserts the
mobile UI renders the real worker WebSocket broadcast. Set
`HOT_HANDS_E2E_NODE_PATH` when Wrangler needs an explicit Node 22+ binary.

`verify:perf` can graduate from its current placeholder to the spectator
heartbeat/load harness, with this contract remaining a fast correctness check.
