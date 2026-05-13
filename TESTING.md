# Hot Hands Testing And Verification

Last updated: May 13, 2026

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

Expected checks:

- TypeScript typecheck.
- Lint.
- Unit tests.
- Durable Object tests.
- Move tests.
- Transaction builder snapshots.

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
- save screenshots

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

- hot shooter wins 5 in a row
- trap streak wins often but loses ROI
- cold table loses twice
- whale attracts spectators
- copy volume changes rank
- signal posted too close to expiry is ignored

## Agent Done Definition

A change is done when:

- the relevant tests are added before or with implementation
- the narrow verification command passes
- shared schemas are updated if event shapes changed
- demo fixtures still run
- the agent reports remaining risk honestly

