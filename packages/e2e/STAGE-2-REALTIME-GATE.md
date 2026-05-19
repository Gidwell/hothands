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
- Mobile Playwright e2e keeps the existing copy-next-signal flow green through
  arm, signal, copy execution, settlement, and leaderboard update.

## WebSocket Smoke Target

This is not required for the first simulated gate. Add it once the worker can be
started consistently in verification:

- open a local table WebSocket
- receive a welcome or snapshot message
- send `join`, `ping`, `arm_copy`, and `disarm_copy`
- assert `pong` and table delta messages are encoded with the shared protocol
- connect a second client and assert a broadcast is observed
- close one client and assert presence/armed counts settle without writing every
  heartbeat durably

Keep the smoke small. Its job is to prove the live socket path still matches the
worker protocol tests, not to replace load or performance verification.

## Root Scripts

`verify:realtime:sim` is the fast simulated realtime gate. It runs worker
protocol/state tests, demo activity adapter tests, and the mobile Playwright
suite together.

When the WebSocket smoke exists, keep it opt-in until stable:

```json
"verify:realtime:smoke": "bun run --cwd packages/e2e test -- --grep @realtime-smoke"
```

After the smoke is reliable in CI, `verify:perf` can graduate from its current
placeholder to the spectator heartbeat/load harness, with the smoke remaining a
fast correctness check.
