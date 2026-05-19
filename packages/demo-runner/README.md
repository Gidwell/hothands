# Hot Hands Demo Runner

Scripted fake users and table scenarios.

Modes:

- fixture mode
- replay mode
- live testnet bot mode

The demo runner should feed the same realtime and scoring paths as production.

## Stage 2 Realtime Adapter

`produceRealtimeActivityTrace` projects deterministic replay frames into shared
`table_activity` items:

- `signal_landed`
- `copy_submitted`
- `copy_executed`
- `settlement_posted`
- `hot_hand_updated`

These events remain visibly sourced as `fixture_replay` so demo data cannot be
confused with future testnet/indexed activity.

Inspect the stream locally with:

```bash
bun run demo:play opening-night --realtime
```

## Live Worker Demo

Start the PWA and local API Worker together:

```bash
bun run dev:live
```

Then push fixture activity through the worker WebSocket path from another
terminal:

```bash
bun run demo:push-activity opening-night
```

Useful options:

```bash
bun run demo:push-activity opening-night -- --step 0
bun run demo:push-activity hot-hand-swing -- --from 3 --count 4 --interval-ms 1000
```

Environment overrides:

- `HOT_HANDS_LIVE_PWA_PORT`
- `HOT_HANDS_LIVE_WORKER_PORT`
- `HOT_HANDS_WORKER_URL`
- `HOT_HANDS_TABLE_ID`
- `HOT_HANDS_E2E_NODE_PATH`
