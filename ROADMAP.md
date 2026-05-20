# Hot Hands Roadmap

Last updated: May 19, 2026

The hackathon submission deadline is June 21, 2026. This roadmap is organized around gates. Each gate should end with a working demo or a major risk retired.

## Stage 0: Lock The Shape

Target: May 13-14

Goal: create a project source of truth and a repo structure that supports parallel work.

Checkpoint:

- Hot Hands pitch and MVP loop documented.
- Repo map exists.
- Agent ownership rules exist.
- Product, architecture, and verification docs exist.
- Bun chosen for package management, with Workers still verified through Wrangler/workerd.

Exit test:

```bash
rg "DeepBook trader heats up -> follower arms watch"
rg "Do not write every heartbeat"
```

## Stage 1: Fake Data Vertical Slice

Target: May 14-17

Status: Complete on `main`.

Goal: make the app feel good locally before fighting testnet.

Deliverables:

- Mobile PWA shell.
- Deterministic table fixture.
- Fake spectators join and leave.
- Fake leader posts signal.
- Follower arms copy-next-signal.
- Fake settlement updates streak and leaderboard.

TDD:

- fixture parser tests
- scoring tests for one win, one loss, trap streak
- Playwright mobile flow test

Verification:

```bash
bun run demo:play opening-night
bun run verify:fast
bun run verify:e2e
```

Completion notes:

- PWA uses shared replay frames for `opening-night`, `trap-streak`, and `hot-hand-swing`.
- Worker has fake spectator simulation coverage for joins, heartbeats, arm/rearm/disarm, leaving, and per-leader armed counts.
- Mobile Playwright e2e verifies the core copy-next-signal loop through settlement and leaderboard update.
- Final build/e2e verification passed from `/private/tmp/hot-hands-worktrees/integration-verify` to avoid local Vite/esbuild path issues in the Codex project folder.

## Stage 2: Simulated Realtime Tables

Target: May 18-22

Status: Complete on `main`.

Goal: make the app behave like a production realtime table before adding testnet variability.

Stage 1 carry-forward:

- Keep fixture mode green while adding realtime mode.
- Preserve the mobile e2e copy loop as the product baseline.
- Use simulated events shaped like future indexed/testnet events, so Stage 3 can swap the source without rewriting the PWA.

Deliverables:

- Durable Object protocol for richer table activity: spectator joins, copy arms, leader signal landed, copy submitted, settlement posted, and hot-score update.
- Demo-runner adapter that emits JSON-safe realtime activity traces from existing fixtures.
- PWA adapter path for consuming table activity through the same state shape the UI already understands.
- Optional PWA live activity mode behind `VITE_HOT_HANDS_API_URL`, with replay fallback when live config or socket connectivity is unavailable.
- Verification docs and commands for the simulated realtime gate.
- Optional worker-backed local smoke that starts Wrangler and verifies a real worker WebSocket broadcast reaches the PWA.
- No Postgres writes per heartbeat.

TDD:

- protocol encode/parse tests
- demo activity adapter fixture tests
- worker table broadcast tests
- mobile e2e still verifies the one-shot copy loop

Verification:

```bash
bun run verify:realtime:sim
bun run verify:fast
```

Completion notes:

- Shared `table_activity` events now cover signal landed, copy submitted,
  copy executed, settlement posted, and hot-score update.
- Demo runner projects deterministic fixtures into JSON-safe realtime activity
  traces.
- API Worker validates and broadcasts ordered activity traces through the
  table Durable Object WebSocket path without persisting heartbeat traffic.
- PWA has a local activity model plus a browser-facing worker message parser
  that ignores non-activity messages and malformed activity frames.
- PWA can open an optional live worker subscription and fall back to deterministic
  replay when live config or socket connectivity is unavailable.
- E2E has an in-process realtime contract proving a subscribed table socket
  receives the opening-night activity lifecycle and hot-score deltas in order.
- E2E has a mocked live-mode PWA check and an optional Wrangler-backed smoke:
  `bun run --cwd packages/e2e test:worker-live`.

Remaining verifier gaps before production realtime:

- Add `verify:perf` for table fanout, heartbeat cadence, and thousands of
  active tables.
- Add visual regression checks for the mobile table density and copy panel.
- Add deployed-worker or preview-environment verification when the hosting
  target is selected.

Risk:

- Do not overbuild the backend; this stage proves the event shape and realtime loop, not the full production data layer.
- Simulated data must stay visibly distinguishable from future live testnet data.

## Stage 3: DeepBook Predict Spike

Target: May 20-25

Status: In progress. Read canary and transaction-builder checkpoint are green on
`codex/deepbook-predict-tx-builders`.

Goal: make the app feel alive with real DeepBook Predict activity before Hot
Hands-native leaders exist.

Stage 2 carry-forward:

- Keep simulated realtime mode green while adding testnet mode.
- Start with current official DeepBook Predict docs and shared config constants before writing transaction code.
- Preserve the mobile e2e copy loop as the product baseline; Stage 3 should add
  proof of real testnet activity without breaking the local demo.

Deliverables:

- Confirm current Predict server, package IDs, registry, quote asset, and provisional-docs pin.
- Read active BTC oracles from the public Predict server.
- Read recent Predict mints/redeems and per-oracle trade history from the
  public server.
- Normalize external trader/manager activity into provisional `Market Heat`.
- Add a PWA testnet-read mode that renders real BTC trade activity and lets a
  user watch a trader's next observed mint with copy disabled, preview-only, or
  user-signed depending on wallet readiness.
- Keep the first `verify:testnet` checkpoint non-funded: Predict server reads
  plus Sui dev-inspect.
- Build valid SDK transactions for manager creation, quote deposit, and Predict
  mint.
- Create/find `PredictManager` after transaction snapshots exist.
- Deposit DUSDC into manager after wallet-flow prerequisites are verified.
- Execute one real UP/DOWN testnet trade.
- Read indexed mint event back.

TDD:

- read-canary response parsing tests
- trade-history response parsing and normalization tests
- PWA testnet mode tests with fixture-captured Predict rows
- transaction builder snapshot tests
- config validation tests
- dev-inspect test against testnet before wallet credentials exist
- funded dry-run test against testnet when wallet objects exist

Verification:

```bash
bun run verify:testnet
```

Risk:

- DeepBook Predict docs are currently pinned to `predict-testnet-4-16`; package IDs, object layouts, and entrypoints are provisional before mainnet.
- Testnet token access may require manual faucet/request flow.
- `create_manager` can be dev-inspected without funds, but deposit and mint
  dry-runs need gas, DUSDC, an existing `PredictManager`, and a live oracle.
- Public Predict trade rows are protocol activity, not Hot Hands-native social
  proof. Label rankings as `Market Heat` until watch rules, copy receipts, and
  settlement-aware scoring are linked.

## Stage 4: Hot Hands Watch And Proof Contracts

Target: May 23-28

Goal: create the minimal proof layer for watched external trades and later
native signals.

Deliverables:

- `ProfileCreated`
- `ExternalTraderWatched`
- `WatchRuleArmed`
- `SignalPosted`
- `CopyRuleArmed`
- `CopyReceipt`
- `Followed`

TDD:

- Move unit tests for all event paths.
- TS transaction builder tests for each call.

Verification:

```bash
bun run move:test
bun run test:contracts
```

## Stage 5: Real Watch Next Trade

Target: May 27-June 4

Goal: complete the core user loop end to end.

Deliverables:

- Follower watches a hot external Predict trader or manager.
- Backend detects that trader's next BTC UP/DOWN mint.
- Backend prepares follower copy transaction using sizing and freshness guards.
- Follower signs and executes DeepBook Predict mint.
- Copy receipt links follower, watched trader, source mint, and copied mint.
- Redeem/settlement updates external wallet heat and follower copy result.
- Hot Hands-native signal copy remains supported as a later lower-latency path.

TDD:

- watch rule matching tests
- copy sizing tests
- max-cost guard tests
- observed-mint freshness tests
- prepared transaction snapshot tests
- e2e test with mocked wallet

Verification:

```bash
bun run verify:fast
bun run verify:e2e
bun run verify:testnet
```

## Stage 6: Realtime Scale And Perf

Target: June 1-6

Goal: make thousands of active tables viable.

Deliverables:

- Durable Object per active table.
- WebSocket spectator presence.
- Armed copy count.
- Table deltas.
- Home page subscribes only to visible hot tables.
- Performance harness for active table fanout.

TDD:

- Durable Object tests with Cloudflare Workers Vitest pool.
- reconnect behavior tests.
- heartbeat timeout tests.

Verification:

```bash
bun run test:worker
bun run verify:perf
```

Initial budgets:

- heartbeat acknowledgement p95 under 250ms
- broadcast p95 under 500ms
- missed heartbeat rate under 1 percent
- no Postgres writes per heartbeat

## Stage 7: Scoring And Leaderboards

Target: June 4-10

Goal: make "who is hot?" trustworthy.

Deliverables:

- external wallet market heat score
- observed trade normalization
- signal resolution worker
- hot score snapshots
- current streak
- recent ROI
- realized PnL
- hit rate
- copied volume
- anti-gaming penalties

TDD:

- fixture-heavy unit tests
- edge cases for near-expiry signals
- ROI clipping tests
- sample-size weighting tests

Verification:

```bash
bun run test:scoring
bun run demo:play trap-streak
```

## Stage 8: Live Market Polish

Target: June 8-14

Goal: make judges remember the experience.

Deliverables:

- chip animations
- table glow by streak
- bottom-sheet copy flow
- spectator stack
- copy volume chips
- PWA install polish
- optional haptics and sound toggle

TDD:

- visual screenshot checks
- mobile viewport layout checks
- reduced-motion mode smoke test

Verification:

```bash
bun run verify:e2e
bun run verify:visual
```

## Stage 9: Hardening And Submission

Target: June 14-21

Goal: make the demo reliable.

Deliverables:

- final demo script
- final seed wallets
- fallback replay mode
- README and architecture diagram
- pitch video outline
- submission copy

Verification:

```bash
bun run verify:fast
bun run verify:e2e
bun run verify:perf
bun run verify:testnet
```

Submission gate:

- demo runs in live testnet mode
- demo runs in replay fallback mode
- no blocking console errors
- mobile screenshots look polished
- project explains DeepBook usage clearly
