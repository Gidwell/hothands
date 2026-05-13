# Hot Hands Git Workflow

## Branches

Use `codex/` branches for agent-led implementation work.

Current integration branch:

```text
codex/hot-hands-stage-1
```

Recommended branch pattern:

```text
codex/stage-1-pwa
codex/stage-1-realtime
codex/stage-1-fixtures
codex/stage-2-deepbook-spike
```

## Checkpoint Commits

Prefer small commits by vertical checkpoint:

1. Planning scaffold.
2. Fake-data foundations.
3. Realtime table skeleton.
4. PWA table shell.
5. Root verification wiring.
6. Integration from fixtures into PWA/Worker.

Commit messages should describe the product or verification gate, not just the package touched.

Examples:

```text
docs: define hot hands sprint plan
feat(fixtures): add deterministic opening night scenario
feat(realtime): add table room websocket skeleton
feat(pwa): add mobile hot table shell
test: wire stage 1 verification scripts
```

## Worktrees

After the first commit exists, use git worktrees for larger parallel work. Each worktree should own one package or one tightly scoped integration.

Suggested layout outside the main repo:

```text
/private/tmp/hot-hands-worktrees/
  stage-1-pwa/
  stage-1-realtime/
  stage-1-fixtures/
  stage-2-deepbook-spike/
```

Example:

```bash
mkdir -p /private/tmp/hot-hands-worktrees
git worktree add /private/tmp/hot-hands-worktrees/stage-1-pwa -b codex/stage-1-pwa codex/hot-hands-stage-1
```

## Agent Rules

- Agents work in their assigned branch/worktree when possible.
- Agents own disjoint directories.
- Agents follow red/green TDD and report the failing command before implementation.
- Agents do not rebase or reset shared branches.
- Agents report changed files and verification commands.
- The orchestrator reviews and merges package branches into the integration branch.

## Merge Gates

Before merging a worktree branch into the integration branch:

```bash
bun run verify:fast
git diff --check
```

Additional package checks:

- PWA changes: build or Playwright smoke once dependencies are installed.
- Worker changes: Worker bundle check and Durable Object tests.
- Scoring changes: fixture tests.
- Contract changes: `sui move test`.

## Dependency Installs

Do not let every agent install dependencies independently. The orchestrator should run dependency installation from the integration branch, commit the lockfile, then worktrees should use that baseline.
