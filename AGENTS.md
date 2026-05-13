# Agent Development Guide

This file is the operating manual for human and AI contributors.

## Prime Directive

Build a thin, verified end-to-end loop first:

```text
leader signal -> follower arms copy -> copy transaction -> settlement -> hot score update
```

Everything else supports that loop.

## Git Discipline

Use the workflow in `GIT_WORKFLOW.md`.

Default branch prefix:

```text
codex/
```

Once the first repository commit exists, larger parallel work should happen in git worktrees. Agents should not commit directly to the shared integration branch unless the orchestrator explicitly asks them to.

## Workstream Ownership

Keep write scopes disjoint when running agents in parallel.

### Agent A: PWA

Owns:

- `apps/pwa`
- mobile table UI
- copy tray
- spectator rail
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
- Do not hardcode provisional DeepBook IDs outside shared config.
- Do not make fixture data indistinguishable from live testnet data.
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
