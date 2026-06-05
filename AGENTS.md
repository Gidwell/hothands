# Agent Development Guide

This file is the operating manual for human and AI contributors.

Last updated: May 19, 2026

## Prime Directive

Build a thin, verified end-to-end loop first:

```text
DeepBook trader heats up -> follower arms watch -> observed mint -> prepared copy -> user signs -> settlement -> hot score update
```

Everything else supports that loop.

## Git Discipline

Use the workflow in `GIT_WORKFLOW.md`.

Default branch prefix:

```text
codex/
```

Once the first repository commit exists, larger parallel work should happen in git worktrees. Agents should not commit directly to the shared integration branch unless the orchestrator explicitly asks them to.

## Local Testnet Dev Loop

Use indexed testnet mode as the default development loop:

```bash
export DATABASE_URL=postgres://$USER@127.0.0.1:5432/hothands_dev
HOT_HANDS_TESTNET_API_PORT=8792 HOT_HANDS_TESTNET_PWA_PORT=5184 bun run dev:testnet
```

For product verification, `Live Testnet`, `Captured`, or
`indexer_unavailable` is a failed/dev-degraded environment, not success. Fix
Postgres, migrations, backfill, or the live indexer before continuing. Only use
`HOT_HANDS_ALLOW_FALLBACK_TESTNET=true` for explicit fallback diagnostics.

When restarting local dev, prefer `bun run dev:cleanup` followed by the indexed
`dev:testnet` command above. Do not start a standalone PWA or fallback API while
the user is testing the product loop unless explicitly asked.

## Workstream Ownership

Keep write scopes disjoint when running agents in parallel.

### Agent A: PWA

Owns:

- `apps/pwa`
- mobile table UI
- copy tray
- spectator stack
- Playwright selectors for UI flows

Does not own:

- scoring rules
- Durable Object protocol
- transaction builders

### Agent B: Realtime

Owns:

- `apps/api-worker`
- Durable Object table state
- WebSocket protocol
- heartbeat behavior
- table broadcast tests

Does not own:

- PWA visual design beyond protocol examples
- Postgres schema except realtime projections

### Agent C: Scoring / Indexer

Owns:

- `packages/indexer`
- scoring engine
- signal resolution
- DeepBook Predict trade-history normalization
- external wallet heat scoring
- hot table cache
- fixture-based score tests

Does not own:

- UI components
- Move contracts

### Agent D: Contracts / Transactions

Owns:

- `packages/contracts`
- Move event package
- TypeScript transaction builders
- DeepBook Predict integration spike notes

Does not own:

- demo scenario writing
- PWA styling

### Agent E: Demo Runner

Owns:

- `packages/demo-runner`
- `packages/fixtures`
- fake users
- scripted table scenarios
- replay-mode adapters

Does not own:

- production scoring semantics except through fixtures

### Agent F: Verification

Owns:

- `packages/e2e`
- Playwright tests
- performance harness
- CI scripts
- verification docs

Does not own:

- feature implementation except minimal test hooks

## Shared Interfaces

Shared types belong in `packages/shared`.

Before adding a cross-package concept, define:

- type or schema
- example fixture
- expected owner package
- test covering parsing/validation

## Stage 1 Agent Lessons

- Prefer shared fixtures and replay frames over package-local demo data. The PWA should adapt shared scenarios, not invent its own parallel story.
- Add stable accessible labels or `data-testid` hooks while building UI, because e2e agents should not have to edit the PWA just to verify the product loop.
- Keep root script, lockfile, and dependency changes narrow. Announce them clearly because they affect every worktree.
- Ignore or delete Playwright runtime artifacts such as `test-results/` and `playwright-report/` before committing.
- If Vite/esbuild behaves oddly in the Codex project path with spaces, verify from a clean no-space worktree rather than weakening tests.
- Browser smoke is useful, but a real Playwright mobile e2e is the authority for the Stage 1 copy loop.

## Required Commands

When implemented, these commands should be the main loop:

```bash
bun run typecheck
bun run lint
bun run test
bun run test:worker
bun run move:test
bun run verify:fast
bun run verify:e2e
bun run verify:perf
bun run verify:testnet
```

Until implementation exists, scripts may be placeholders. Replace placeholders as soon as a package is real.

## Test-First Rules

- Agents must use red/green TDD for implementation slices:
  1. write or update the narrow test/check first
  2. run it and confirm the expected failure
  3. implement the smallest change that makes it pass
  4. rerun the package check and any affected root verification
- Scoring changes require fixture tests first.
- Realtime protocol changes require Durable Object tests first.
- Transaction builder changes require snapshot tests and dry-run coverage.
- PWA flows require Playwright selectors and at least one mobile e2e path.
- Move contract changes require `sui move test`.
- Demo runner scenarios require expected trace assertions.

## Do Not

- Do not write every heartbeat to Postgres.
- Do not build automatic custodial copy trading for MVP.
- Do not imply external wallet watches are pre-trade signals; they are reactive
  copies of observed DeepBook Predict mints unless a Hot Hands-native signal
  exists.
- Do not hardcode provisional DeepBook IDs outside shared config.
- Do not make fixture data indistinguishable from live testnet data.
- Do not reintroduce literal craps/dice/rail language into product UI or docs unless the user explicitly asks for that motif.
- Do not let agents edit each other's packages without announcing it.
- Do not skip verification because the UI "looks fine."

## Handoff Format

Each agent final update should include:

- red command and expected failure summary
- green command results
- changed files
- commit hash, if the branch was committed
- known risks
- next package boundary needed
