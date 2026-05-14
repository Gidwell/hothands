# Hot Hands Roadmap

Last updated: May 14, 2026

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
rg "leader signal -> follower arms copy"
rg "Do not write every heartbeat"
```

## Stage 1: Fake Data Vertical Slice

Target: May 14-17

Status: Complete on `codex/hot-hands-stage-1`.

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

## Stage 2: DeepBook Predict Spike

Target: May 16-20

Goal: retire the largest external integration risk.

Deliverables:

- Read active BTC oracles.
- Build a valid Predict mint transaction.
- Create/find `PredictManager`.
- Deposit DUSDC into manager.
- Execute one real UP/DOWN testnet trade.
- Read indexed mint event back.

TDD:

- transaction builder snapshot tests
- config validation tests
- dry-run test against testnet when credentials exist

Verification:

```bash
bun run verify:testnet
```

Risk:

- DeepBook Predict contracts are provisional testnet targets.
- Testnet token access may require manual faucet/request flow.

## Stage 3: Hot Hands Contracts

Target: May 18-23

Goal: create the minimal onchain social proof layer.

Deliverables:

- `ProfileCreated`
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

## Stage 4: Real Copy Next Signal

Target: May 22-29

Goal: complete the core user loop end to end.

Deliverables:

- Leader posts real signal.
- Follower arms copy rule.
- Backend prepares follower copy transaction.
- Follower signs and executes DeepBook Predict mint.
- Copy receipt links follower, leader, signal, and trade.
- Settlement updates both profiles.

TDD:

- copy sizing tests
- max-cost guard tests
- prepared transaction snapshot tests
- e2e test with mocked wallet

Verification:

```bash
bun run verify:fast
bun run verify:e2e
bun run verify:testnet
```

## Stage 5: Realtime Tables

Target: May 27-June 4

Goal: make tables feel alive.

Deliverables:

- Durable Object per active table.
- WebSocket spectator presence.
- Armed copy count.
- Table deltas.
- Home page subscribes only to visible hot tables.

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

## Stage 6: Scoring And Leaderboards

Target: June 1-8

Goal: make "who is hot?" trustworthy.

Deliverables:

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

## Stage 7: Live Market Polish

Target: June 6-14

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

## Stage 8: Hardening And Submission

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
